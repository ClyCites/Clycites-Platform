import { Module } from '@nestjs/common';

import { PilotsController } from './pilots.controller.js';
import { PilotParticipantsController } from './pilot-participants.controller.js';
import { PilotParticipantsService } from './pilot-participants.service.js';
import { PilotTrainingService } from './pilot-training.service.js';
import {
  PilotEvidenceController,
  PublicPilotFeedbackController,
} from './pilot-evidence.controller.js';
import { PilotEvidenceService } from './pilot-evidence.service.js';
import { PilotSupportService } from './pilot-support.service.js';
import { PilotEvaluationController } from './pilot-evaluation.controller.js';
import { PilotEvaluationService } from './pilot-evaluation.service.js';
import { PilotPreflightService } from './pilot-preflight.service.js';
import { PilotImportController } from './pilot-import.controller.js';
import { PilotImportService } from './pilot-import.service.js';
import { PilotsService } from './pilots.service.js';

@Module({
  controllers: [
    PilotsController,
    PilotParticipantsController,
    PilotEvidenceController,
    PublicPilotFeedbackController,
    PilotEvaluationController,
    PilotImportController,
  ],
  providers: [
    PilotsService,
    PilotParticipantsService,
    PilotTrainingService,
    PilotEvidenceService,
    PilotSupportService,
    PilotEvaluationService,
    PilotPreflightService,
    PilotImportService,
  ],
  exports: [PilotsService],
})
export class PilotsModule {}
