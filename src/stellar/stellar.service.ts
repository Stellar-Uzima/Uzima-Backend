// src/stellar/stellar.service.ts
import { Injectable } from '@nestjs/common';
import StellarSdk from 'stellar-sdk';
const { Server, Keypair } = StellarSdk;

@Injectable()
export class StellarService {
  private server;

  constructor() {
    this.server = new Server('https://horizon-testnet.stellar.org');
  }

  async accountExists(address: string): Promise<boolean> {
    try {
      await this.server.accounts().accountId(address).call();
      return true;
    } catch {
      return false;
    }
  }

  // Add more Stellar logic here
}
