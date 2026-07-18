import { Module } from '@nestjs/common';
import { FarmerQrController } from './farmer-qr.controller.js';
import { FarmerQrService } from './farmer-qr.service.js';
@Module({ controllers: [FarmerQrController], providers: [FarmerQrService] })
export class FarmerQrModule {}
