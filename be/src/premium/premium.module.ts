import { Module } from '@nestjs/common';
import { PremiumController } from './premium.controller.ts';
import { PremiumService } from './premium.service.ts';
import { DatabaseModule } from '../database/database.module.ts';


@Module({
    imports: [DatabaseModule],
    controllers: [PremiumController],
    providers: [PremiumService],
})
export class PremiumModule { }
