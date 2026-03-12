import { PublishCommand } from "@aws-sdk/client-sns";
import type { DynamoDBStreamEvent, DynamoDBRecord } from "aws-lambda";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import type { AttributeValue } from "@aws-sdk/client-dynamodb";
import {
  snsClient,
  SNS_TOPIC_ARN,
  PUBLISHABLE_STATUSES,
  TransactionMessage,
} from "./shared";

function extractTransactionFromRecord(record: DynamoDBRecord): TransactionMessage | null {
  if (!record.dynamodb?.NewImage) {
    return null;
  }

  const newImage = unmarshall(
    record.dynamodb.NewImage as Record<string, AttributeValue>
  );

  return {
    id: newImage.id,
    status: newImage.status,
    amount: newImage.amount,
    reference: newImage.reference,
  };
}

export async function handler(event: DynamoDBStreamEvent): Promise<void> {
  for (const record of event.Records) {
    try {
      console.log("stream_event_received", {
        eventName: record.eventName,
        eventID: record.eventID,
      });

      if (record.eventName !== "INSERT" && record.eventName !== "MODIFY") {
        continue;
      }

      const transaction = extractTransactionFromRecord(record);

      if (!transaction) {
        console.log("stream_event_no_new_image", { eventID: record.eventID });
        continue;
      }

      if (!PUBLISHABLE_STATUSES.includes(transaction.status)) {
        console.log("stream_event_status_not_publishable", {
          id: transaction.id,
          status: transaction.status,
        });
        continue;
      }

      await snsClient.send(
        new PublishCommand({
          TopicArn: SNS_TOPIC_ARN,
          Message: JSON.stringify(transaction),
          MessageAttributes: {
            status: {
              DataType: "String",
              StringValue: transaction.status,
            },
          },
        })
      );

      console.log("event_published_to_sns", {
        id: transaction.id,
        status: transaction.status,
      });
    } catch (err: unknown) {
      console.log("stream_publisher_error", {
        error: err,
        eventID: record.eventID,
      });
      throw err;
    }
  }
}
