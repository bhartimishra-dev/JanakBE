import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../../common/decorators/roles.decorator';
import { ContactEnquiryStatus } from '../../../common/enums/contact-enquiry-status.enum';
import { UserRole } from '../../../common/enums/user-role.enum';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { UpdateContactEnquiryDto } from '../dto/update-contact-enquiry.dto';
import { AdminContactEnquiriesService } from './admin-contact-enquiries.service';

@ApiTags('Admin - Contact Enquiries')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@UseGuards(RolesGuard)
@Controller('admin/contact-enquiries')
export class AdminContactEnquiriesController {
  constructor(private adminContactEnquiriesService: AdminContactEnquiriesService) {}

  @Get()
  @ApiOperation({ summary: 'List "Contact us" enquiries with status, search and date filters' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'status', enum: ContactEnquiryStatus, required: false })
  @ApiQuery({ name: 'search', required: false, description: 'Search by name, email, phone or subject' })
  @ApiQuery({ name: 'from', required: false, description: 'Start date (YYYY-MM-DD)' })
  @ApiQuery({ name: 'to', required: false, description: 'End date (YYYY-MM-DD)' })
  findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('status') status?: ContactEnquiryStatus,
    @Query('search') search?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.adminContactEnquiriesService.findAll(page, limit, status, search, from, to);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get enquiry detail' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminContactEnquiriesService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update enquiry status and/or internal admin notes' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateContactEnquiryDto) {
    return this.adminContactEnquiriesService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an enquiry' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminContactEnquiriesService.remove(id);
  }
}
