import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';
import { CompanyProfileService } from './company-profile.service';
import { CreateCompanyProfileDto } from './dto/company-profile.dto';

const storage = diskStorage({
  destination: './public/uploads/company-docs',
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    cb(null, `${unique}${extname(file.originalname)}`);
  },
});

const fileFilter = (_req: any, file: Express.Multer.File, cb: any) => {
  const allowed = ['.jpg', '.jpeg', '.png', '.pdf'];
  if (allowed.includes(extname(file.originalname).toLowerCase())) {
    cb(null, true);
  } else {
    cb(new BadRequestException('Only JPG, PNG, and PDF files are allowed'), false);
  }
};

@ApiTags('Company Profile')
@ApiBearerAuth()
@Controller('company-profile')
export class CompanyProfileController {
  constructor(private companyProfileService: CompanyProfileService) {}

  @Post()
  @ApiOperation({ summary: 'Create or update company profile with PAN card and GST certificate' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'panCardFile', maxCount: 1 },
        { name: 'gstCertificateFile', maxCount: 1 },
      ],
      { storage, fileFilter, limits: { fileSize: 5 * 1024 * 1024 } }, // 5MB limit
    ),
  )
  upsert(
    @CurrentUser() user: User,
    @Body() dto: CreateCompanyProfileDto,
    @UploadedFiles()
    files: { panCardFile?: Express.Multer.File[]; gstCertificateFile?: Express.Multer.File[] },
  ) {
    return this.companyProfileService.upsert(user, dto, files ?? {});
  }

  @Get()
  @ApiOperation({ summary: 'Get current user company profile' })
  findMine(@CurrentUser() user: User) {
    return this.companyProfileService.findByUser(user.id);
  }
}
