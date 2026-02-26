// src/stellar/stellar.service.ts
import { Injectable } from '@nestjs/common';
import StellarSdk from 'stellar-sdk';
import { CreateStellarDto } from './dto/create-stellar.dto';
import { UpdateStellarDto } from './dto/update-stellar.dto';

@Injectable()
export class StellarService {
  private server: InstanceType<typeof StellarSdk.Horizon.Server>;

  constructor() {
    this.server = new StellarSdk.Horizon.Server('https://horizon-testnet.stellar.org');
  }

  async accountExists(address: string): Promise<boolean> {
    try {
      await this.server.accounts().accountId(address).call();
      return true;
    } catch {
      return false;
    }
  }

  async create(_createStellarDto: CreateStellarDto): Promise<unknown> {
    return {};
  }

  async findAll(): Promise<unknown[]> {
    return [];
  }

  async findOne(_id: number): Promise<unknown> {
    return null;
  }

  async update(_id: number, _updateStellarDto: UpdateStellarDto): Promise<unknown> {
    return {};
  }

  async remove(_id: number): Promise<void> {}
}
