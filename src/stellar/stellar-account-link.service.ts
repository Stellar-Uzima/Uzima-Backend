import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import StellarSdk from 'stellar-sdk';
import { StellarService } from './stellar.service';
import {
  StellarAccountLink,
  StellarAccountLinkStatus,
  StellarNetwork
} from './entities/stellar-account-link.entity';
import { LinkStellarAccountDto } from './dto/link-stellar-account.dto';

@Injectable()
export class StellarAccountLinkService {
  private readonly logger = new Logger(StellarAccountLinkService.name);

  constructor(
    private readonly stellarService: StellarService,
    @InjectDataSource() private readonly dataSource: DataSource
  ) {}

  private get repository() {
    return this.dataSource.getRepository(StellarAccountLink);
  }

  /**
   * Links a Stellar account to the authenticated user.
   *
   * Ownership is proven by an ed25519 signature (see
   * {@link buildOwnershipMessage}) over the sha256 digest of the binding
   * message. Links are unique per user and per Stellar account; conflicts are
   * rejected. When the account is funded on the configured network the link
   * is stored as VERIFIED, otherwise as PENDING until the account is funded.
   */
  async linkAccount(userId: string, dto: LinkStellarAccountDto): Promise<StellarAccountLink> {
    if (!StellarSdk.StrKey.isValidEd25519PublicKey(dto.publicKey)) {
      throw new BadRequestException('Invalid Stellar public key');
    }

    const configuredNetwork = this.stellarService.getNetworkName();
    const network = dto.network ?? configuredNetwork;
    if (network !== configuredNetwork) {
      throw new BadRequestException(
        `Network must match the configured Stellar network ("${configuredNetwork}")`
      );
    }

    const message = StellarAccountLinkService.buildOwnershipMessage(userId, dto.publicKey);
    const ownsAccount = this.stellarService.verifyMessageSignature(
      message,
      dto.signature,
      dto.publicKey
    );
    if (!ownsAccount) {
      throw new BadRequestException('Stellar account ownership signature is invalid');
    }

    const [existingForUser, existingForKey] = await Promise.all([
      this.repository.findOne({ where: { userId } }),
      this.repository.findOne({ where: { publicKey: dto.publicKey } }),
    ]);
    if (existingForUser) {
      throw new ConflictException(
        'A Stellar account is already linked to this user; remove it before linking another'
      );
    }
    if (existingForKey) {
      throw new ConflictException('This Stellar account is already linked');
    }

    const funded = await this.stellarService.accountExists(dto.publicKey);
    const link = this.repository.create({
      userId,
      publicKey: dto.publicKey,
      network: network as StellarNetwork,
      status: funded ? StellarAccountLinkStatus.VERIFIED : StellarAccountLinkStatus.PENDING,
      verificationTxHash: null,
      verifiedAt: funded ? new Date() : null,
    });

    try {
      this.logger.log(
        `Stellar account linked for user ${userId}: ${dto.publicKey} (${network}, ${link.status})`
      );
      return await this.repository.save(link);
    } catch {
      throw new ConflictException(
        'This Stellar account link conflicts with an existing link'
      );
    }
  }

  /**
   * Returns the authenticated user's Stellar account link, or null.
   */
  async getAccount(userId: string): Promise<StellarAccountLink | null> {
    return this.repository.findOne({ where: { userId } });
  }

  /**
   * Removes the authenticated user's Stellar account link.
   */
  async removeAccount(userId: string): Promise<void> {
    const existing = await this.repository.findOne({ where: { userId } });
    if (!existing) {
      throw new NotFoundException('No Stellar account is linked to this user');
    }
    await this.repository.remove(existing);
    this.logger.log(`Stellar account unlinked for user ${userId}`);
  }

  /**
   * Canonical message a client must sign (over its sha256 digest) to prove
   * ownership of `publicKey` for `userId`.
   */
  static buildOwnershipMessage(userId: string, publicKey: string): string {
    return `Uzima Stellar linking:${userId}:${publicKey}`;
  }
}
