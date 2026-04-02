import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { getTwilioConfig } from "./twilio.config";
import { TwilioController } from "./twilio.controller";
import { TwilioService } from "./twilio.service";
import {
  AirtableLeadRepository,
  InMemoryLeadRepository,
  TWILIO_LEAD_REPOSITORY
} from "./twilio.repository";

@Module({
  imports: [],
  controllers: [AppController, TwilioController],
  providers: [
    TwilioService,
    {
      provide: TWILIO_LEAD_REPOSITORY,
      useFactory: () => {
        const config = getTwilioConfig();

        if (config.airtable) {
          return new AirtableLeadRepository(config.airtable);
        }

        return new InMemoryLeadRepository();
      }
    }
  ]
})
export class AppModule {}
