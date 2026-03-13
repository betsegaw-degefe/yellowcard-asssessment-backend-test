import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { SNSClient } from "@aws-sdk/client-sns";

export const TABLE_NAME = process.env.TABLE_NAME ?? "transactions";
export const SNS_TOPIC_ARN = process.env.SNS_TOPIC_ARN!;

export enum TransactionStatus {
  PENDING = "PENDING",
  PROCESSING = "PROCESSING",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
}

export interface TransactionMessage {
  id: string;
  status: TransactionStatus;
  amount: number;
  reference: string;
}

/**
 * LocalStack endpoint support:
 * We rely on AWS_ENDPOINT_URL when present.
 */
function getClient(): DynamoDBDocumentClient {
  const endpoint = process.env.AWS_ENDPOINT_URL;
  const ddb = new DynamoDBClient({
    endpoint,
    region: process.env.AWS_DEFAULT_REGION ?? "us-east-1",
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "test",
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "test",
    },
  });
  return DynamoDBDocumentClient.from(ddb);
}

export const ddbDoc = getClient();

function getSNSClient(): SNSClient {
  const endpoint = process.env.AWS_ENDPOINT_URL;
  return new SNSClient({
    endpoint,
    region: process.env.AWS_DEFAULT_REGION ?? "us-east-1",
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "test",
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "test",
    },
  });
}

export const snsClient = getSNSClient();

export function json(statusCode: number, body: unknown) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type,x-idempotency-key",
      "access-control-allow-methods": "GET,POST,OPTIONS",
    },
    body: JSON.stringify(body),
  };
}
