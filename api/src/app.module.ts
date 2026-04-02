import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { TwilioController } from "./twilio.controller";
import { TwilioService } from "./twilio.service";

@Module({
  imports: [],
  controllers: [AppController, TwilioController],
  providers: [TwilioService]
})
export class AppModule {}
