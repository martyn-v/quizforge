import { Controller, Get } from '@nestjs/common';
import { SHARED_PACKAGE } from '@quizforge/shared';

@Controller()
export class AppController {
  @Get('health')
  health() {
    return { status: 'ok', shared: SHARED_PACKAGE };
  }
}
