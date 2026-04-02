import { Controller, Get } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";

@ApiTags("system")
@Controller()
export class AppController {
  @Get()
  @ApiOperation({ summary: "Root endpoint" })
  @ApiOkResponse({
    schema: {
      example: {
        message: "Hello from NestJS API",
        docs: "/docs",
        health: "/health"
      }
    }
  })
  getRoot() {
    return {
      message: "Hello from NestJS API",
      docs: "/docs",
      health: "/health"
    };
  }

  @Get("health")
  @ApiOperation({ summary: "Health check" })
  @ApiOkResponse({
    schema: {
      example: {
        ok: true,
        service: "template-nestjs-api-swagger",
        ts: "2026-04-01T12:00:00.000Z"
      }
    }
  })
  getHealth() {
    return {
      ok: true,
      service: "template-nestjs-api-swagger",
      ts: new Date().toISOString()
    };
  }
}