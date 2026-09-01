import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsISO8601, IsNumber, IsOptional, IsString } from 'class-validator';
import { QuoteStatus } from '../../../common/enums/quote-status.enum';

export class UpdateQuoteStatusDto {
  @ApiProperty({ enum: QuoteStatus })
  @IsEnum(QuoteStatus)
  status: QuoteStatus;
}

export class UpdateQuoteDto {
  @ApiPropertyOptional({ description: 'Negotiated price to quote the customer' })
  @IsOptional()
  @IsNumber()
  quotedPrice?: number;

  @ApiPropertyOptional({ example: '2026-12-31T23:59:59Z', description: 'Quote validity expiry, ISO 8601' })
  @IsOptional()
  @IsISO8601()
  validUntil?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ enum: QuoteStatus })
  @IsOptional()
  @IsEnum(QuoteStatus)
  status?: QuoteStatus;
}
