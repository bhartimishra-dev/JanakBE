import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { ContactService } from './contact.service';
import { CreateContactEnquiryDto } from './dto/create-contact-enquiry.dto';

@ApiTags('Contact')
@Controller('contact')
export class ContactController {
  constructor(private contactService: ContactService) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post()
  @ApiOperation({
    summary: 'Submit a "Contact us" enquiry',
    description:
      'No login required. Saved for the admin team under Admin - Contact Enquiries. Limited to 5 submissions per minute per IP.',
  })
  @ApiResponse({
    status: 201,
    description: 'Enquiry saved',
    schema: {
      example: {
        success: true,
        data: {
          message:
            'Thank you for reaching out. Our team will get back to you shortly.',
        },
        message: 'Success',
        timestamp: '2026-10-17T09:00:00.000Z',
      },
    },
  })
  @ApiResponse({
    status: 400,
    description:
      'Validation failed (e.g. invalid email, empty message, phone not 10 digits)',
  })
  @ApiResponse({
    status: 429,
    description: 'Too many submissions — try again in a minute',
  })
  create(@Body() dto: CreateContactEnquiryDto) {
    return this.contactService.create(dto);
  }
}
