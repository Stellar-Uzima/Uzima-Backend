<<<<<<< HEAD
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { ReferralService } from './referral.service';
import { RedeemReferralDto } from './dto/redeem-referral.dto';

@ApiTags('referrals')
@Controller('referrals')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ReferralController {
  constructor(private readonly referralService: ReferralService) {}

  @Post('generate')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Generate a unique referral code for the current user' })
  @ApiResponse({ status: 201, description: 'Referral code created or returned' })
  async generate(@Req() req: { user: { id?: string; sub?: string } }) {
    const userId = req.user.id ?? req.user.sub;
    return this.referralService.generateReferralCode(userId!);
  }

  @Post('redeem')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Apply a referral code to the current user account' })
  @ApiResponse({ status: 200, description: 'Referral redeemed' })
  @ApiResponse({ status: 404, description: 'Invalid referral code' })
  @ApiResponse({ status: 409, description: 'Already redeemed' })
  async redeem(
    @Req() req: { user: { id?: string; sub?: string } },
    @Body() dto: RedeemReferralDto,
  ) {
    const userId = req.user.id ?? req.user.sub;
    return this.referralService.redeemReferralCode(userId!, dto.referralCode);
  }

  @Get()
  @ApiOperation({ summary: 'List users referred by the current user' })
  async listMyReferrals(@Req() req: { user: { id?: string; sub?: string } }) {
    const userId = req.user.id ?? req.user.sub;
    return this.referralService.getMyReferrals(userId!);
  }

  @Get('me')
  @ApiOperation({ summary: 'Get current user referral summary' })
  @ApiResponse({ status: 200, description: 'Referral summary retrieved' })
  async getMyReferralSummary(@Req() req: { user: { id?: string; sub?: string } }) {
    const userId = req.user.id ?? req.user.sub;
    const referrals = await this.referralService.getMyReferrals(userId!);
    const user = await this.referralService.getUserWithReferralCode(userId!);
    return {
      referralCode: user?.referralCode || null,
      successfulReferralCount: referrals.length,
    };
=======
import { Controller, Get, Post, Body, UseGuards, Req } from '@nestjs/common';
import { ReferralService } from './referral.service';
<<<<<<<< HEAD:src/referral/entities/referral.controller.ts
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
========
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RedeemReferralDto } from './dto/redeem-referral.dto';
>>>>>>>> fea048b (feat(backend): consolidate referral module and add test coverage for referral, streaks & webhook verifier (closes #1055, #1056, #1057, #1061)):src/referral/referral.controller.ts

@Controller('users/me')
@UseGuards(JwtAuthGuard)
export class ReferralController {
  constructor(private readonly referralService: ReferralService) {}

  @Get('referral-code')
  getReferralCode(@Req() req) {
    return this.referralService.getMyReferralCode(req.user.id);
  }

  @Get('referrals')
  getMyReferrals(@Req() req) {
    return this.referralService.getMyReferrals(req.user.id);
  }

  @Post('redeem-referral')
  redeemReferral(@Req() req, @Body() dto: RedeemReferralDto) {
    return this.referralService.redeemReferral(req.user.id, dto);
>>>>>>> fea048b (feat(backend): consolidate referral module and add test coverage for referral, streaks & webhook verifier (closes #1055, #1056, #1057, #1061))
  }
}
