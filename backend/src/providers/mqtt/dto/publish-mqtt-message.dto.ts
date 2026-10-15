import { ApiProperty } from "@nestjs/swagger";
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsBoolean,
  Min,
  Max,
} from "class-validator";

export class PublishMqttMessageDto {
  @ApiProperty({
    description: "ID of the MQTT broker to publish to",
    example: "broker-123",
  })
  @IsString()
  @IsNotEmpty()
  brokerId!: string;

  @ApiProperty({
    description: "MQTT topic to publish the message to",
    example: "sensors/temperature/fermenter-1",
  })
  @IsString()
  @IsNotEmpty()
  topic!: string;

  @ApiProperty({
    description: "Message payload to publish",
    example: '{"temperature": 25.5, "timestamp": "2024-01-01T12:00:00Z"}',
  })
  @IsString()
  @IsNotEmpty()
  payload!: string;

  @ApiProperty({
    description: "Quality of Service level (0, 1, or 2)",
    example: 0,
    required: false,
    minimum: 0,
    maximum: 2,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  qos?: number;

  @ApiProperty({
    description: "Whether the message should be retained by the broker",
    example: false,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  retain?: boolean;
}
