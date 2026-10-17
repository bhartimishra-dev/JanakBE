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
import { SalesRepEnquiryStatus } from '../../../common/enums/sales-rep-enquiry-status.enum';
import { UserRole } from '../../../common/enums/user-role.enum';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { UpdateSalesRepEnquiryDto } from '../dto/update-sales-rep-enquiry.dto';
import { AdminSalesRepEnquiriesService } from './admin-sales-rep-enquiries.service';

@ApiTags('Admin - Sales Rep Enquiries')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@UseGuards(RolesGuard)
@Controller('admin/sales-rep-enquiries')
export class AdminSalesRepEnquiriesController {
  constructor(
    private adminSalesRepEnquiriesService: AdminSalesRepEnquiriesService,
  ) {}

  @Get()
  @ApiOperation({
    summary:
      'List sales rep button clicks with product/customer snapshot, filters and status counts',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'status', enum: SalesRepEnquiryStatus, required: false })
  @ApiQuery({
    name: 'search',
    required: false,
    description:
      'Search by product name/code, sales rep, customer name/email/phone',
  })
  @ApiQuery({
    name: 'productId',
    required: false,
    description: 'Only enquiries for this product',
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
      'Paginated clicks, newest first. Product/sales-rep/customer fields are snapshots taken at click time; product/user are null if since deleted, and customer fields are null for guests/anonymous visitors.',
    schema: {
      example: {
        success: true,
        data: {
          enquiries: [
            {
              id: 'uuid',
              product: { id: 'uuid', slug: 'trimble-r12i-gnss-receiver' },
              productName: 'Trimble R12i GNSS Receiver',
              productCode: 'JNK-R12I',
              modelNumber: 'R12i',
              brandName: 'Trimble',
              categoryName: 'GNSS Receivers',
              price: '1250000.00',
              salesRepName: 'Amit Verma',
              salesRepPhone: '9876500000',
              user: { id: 'uuid', email: 'rahul@example.com' },
              guestId: null,
              customerEmail: 'rahul@example.com',
              customerName: 'Sharma Surveys Pvt Ltd',
              customerPhone: '9876543210',
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
          statusCounts: { new: 1, contacted: 0, closed: 0 },
        },
        message: 'Success',
        timestamp: '2026-10-17T09:00:00.000Z',
      },
    },
  })
  findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('status') status?: SalesRepEnquiryStatus,
    @Query('search') search?: string,
    @Query('productId') productId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.adminSalesRepEnquiriesService.findAll(
      page,
      limit,
      status,
      search,
      productId,
      from,
      to,
    );
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get sales rep enquiry detail',
    description:
      'Same fields as the list item, with the full current product and user records attached (null if deleted).',
  })
  @ApiResponse({ status: 404, description: 'Enquiry not found' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminSalesRepEnquiriesService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update enquiry status and/or internal admin notes',
    description:
      'Status flow: new → contacted → closed. Send only the fields to change.',
  })
  @ApiResponse({
    status: 200,
    description: 'Updated enquiry (same shape as GET :id)',
  })
  @ApiResponse({ status: 404, description: 'Enquiry not found' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSalesRepEnquiryDto,
  ) {
    return this.adminSalesRepEnquiriesService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a sales rep enquiry' })
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
    return this.adminSalesRepEnquiriesService.remove(id);
  }
}
