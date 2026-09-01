import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../../common/decorators/roles.decorator';
import { UserRole } from '../../../common/enums/user-role.enum';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { AdminUsersService } from './admin-users.service';

@ApiTags('Admin - Users')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@UseGuards(RolesGuard)
@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly adminUsersService: AdminUsersService) {}

  @Get()
  @ApiOperation({
    summary: 'List all users with activity, cart and lifetime-value summary. Use filters to narrow down.',
  })
  @ApiQuery({ name: 'search', required: false, description: 'Filter by customer (company) name or email' })
  @ApiQuery({ name: 'hasCartItems', required: false, type: Boolean, description: 'Only users with items in cart' })
  @ApiQuery({ name: 'abandoned', required: false, type: Boolean, description: 'Only users with abandoned carts' })
  @ApiQuery({ name: 'idleHours', required: false, description: 'Hours idle to consider cart abandoned (default: 24)' })
  @ApiQuery({ name: 'locationState', required: false, description: 'Filter by default address state' })
  @ApiQuery({ name: 'joinedWithinDays', required: false, description: 'Only users who joined in the last N days' })
  @ApiQuery({
    name: 'activeWithinHours',
    required: false,
    description: 'Hours since last activity to count as "active" (default: 24)',
  })
  @ApiQuery({ name: 'activityStatus', required: false, enum: ['active', 'inactive', 'all'] })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  findAll(
    @Query('search') search?: string,
    @Query('hasCartItems') hasCartItems?: string,
    @Query('abandoned') abandoned?: string,
    @Query('idleHours') idleHours?: number,
    @Query('locationState') locationState?: string,
    @Query('joinedWithinDays') joinedWithinDays?: number,
    @Query('activeWithinHours') activeWithinHours?: number,
    @Query('activityStatus') activityStatus?: 'active' | 'inactive' | 'all',
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.adminUsersService.findAll({
      search,
      hasCartItems: hasCartItems === 'true',
      abandoned: abandoned === 'true',
      idleHours,
      locationState,
      joinedWithinDays,
      activeWithinHours,
      activityStatus,
      page,
      limit,
    });
  }

  @Get(':userId')
  @ApiOperation({
    summary: 'Get full details for a user — company profile, addresses, cart, orders, lifetime value, login history, recent activity',
  })
  findOne(@Param('userId') userId: string) {
    return this.adminUsersService.findOne(userId);
  }
}
