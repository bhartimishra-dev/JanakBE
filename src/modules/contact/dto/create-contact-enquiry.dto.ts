import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateContactEnquiryDto {
  @ApiProperty({ example: 'Rahul Sharma' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiProperty({ example: 'rahul@example.com' })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({ example: '9876543210' })
  @IsOptional()
  @Matches(/^\d{10}$/, { message: 'Phone must be a 10-digit number' })
  phone?: string;

  @ApiPropertyOptional({ example: 'Bulk order enquiry' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  subject?: string;

  @ApiProperty({
    example: 'I would like pricing for 5 units of the R12i receiver.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  message: string;
}
