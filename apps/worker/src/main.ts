import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';

import { WorkerModule } from './app.module.js';

const application = await NestFactory.createApplicationContext(WorkerModule);
application.enableShutdownHooks();
