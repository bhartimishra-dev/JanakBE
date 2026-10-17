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
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
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
  constructor(
    private adminContactEnquiriesService: AdminContactEnquiriesService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'List "Contact us" enquiries with status, search and date filters',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'status', enum: ContactEnquiryStatus, required: false })
  @ApiQuery({
    name: 'search',
    required: false,
    description: 'Search by name, email, phone or subject',
  })
  @ApiQuery({
    name: 'from',
    required: false,
    description: 'Start date (YYYY-MM-DD)',
  })
  @ApiQuery({
    name: 'to',
    required: false,
    description: 'End date (YYYY-MM-DD)',
  })
  @ApiResponse({
    status: 200,
    description:
      'Paginated enquiries, newest first, with a count per status for tabs/badges',
    schema: {
      example: {
        success: true,
        data: {
          enquiries: [
            {
              id: 'uuid',
              name: 'Rahul Sharma',
              email: 'rahul@example.com',
              phone: '9876543210',
              subject: 'Bulk order enquiry',
              message: 'I would like pricing for 5 units of the R12i receiver.',
              status: 'new',
              adminNotes: null,
              createdAt: '2026-10-17T09:00:00.000Z',
              updatedAt: '2026-10-17T09:00:00.000Z',
            },
          ],
          total: 1,
          page: 1,
          limit: 20,
          totalPages: 1,
          statusCounts: { new: 1, in_progress: 0, resolved: 0 },
        },
        message: 'Success',
        timestamp: '2026-10-17T09:00:00.000Z',
      },
    },
  })
  findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('status') status?: ContactEnquiryStatus,
    @Query('search') search?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.adminContactEnquiriesService.findAll(
      page,
      limit,
      status,
      search,
      from,
      to,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get enquiry detail' })
  @ApiResponse({
    status: 200,
    description: 'Enquiry',
    schema: {
      example: {
        success: true,
        data: {
          id: 'uuid',
          name: 'Rahul Sharma',
          email: 'rahul@example.com',
          phone: '9876543210',
          subject: 'Bulk order enquiry',
          message: 'I would like pricing for 5 units of the R12i receiver.',
          status: 'new',
          adminNotes: null,
          createdAt: '2026-10-17T09:00:00.000Z',
          updatedAt: '2026-10-17T09:00:00.000Z',
        },
        message: 'Success',
        timestamp: '2026-10-17T09:00:00.000Z',
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Enquiry not found' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminContactEnquiriesService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update enquiry status and/or internal admin notes',
    description:
      'Status flow: new → in_progress → resolved. Send only the fields to change.',
  })
  @ApiResponse({
    status: 200,
    description: 'Updated enquiry (same shape as GET :id)',
  })
  @ApiResponse({ status: 404, description: 'Enquiry not found' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateContactEnquiryDto,
  ) {
    return this.adminContactEnquiriesService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an enquiry' })
  @ApiResponse({
    status: 200,
    description: 'Enquiry deleted',
    schema: {
      example: {
        success: true,
        data: { message: 'Enquiry deleted' },
        message: 'Success',
        timestamp: '2026-10-17T09:00:00.000Z',
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Enquiry not found' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminContactEnquiriesService.remove(id);
  }
}
