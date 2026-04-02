import "reflect-metadata";
import { urlencoded } from "express";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(urlencoded({ extended: false }));

  const config = new DocumentBuilder()
    .setTitle("Lead Recovery Lab API")
    .setDescription("Twilio missed-call recovery API")
    .setVersion("1.0.0")
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup("docs", app, document);

  const port = Number(process.env.PORT || 3000);
  await app.listen(port, "0.0.0.0");
  console.log(`Nest API listening on port ${port}`);
}

bootstrap();
