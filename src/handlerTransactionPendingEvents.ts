import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import type { SQSEvent } from "aws-lambda";
import { ddbDoc, TABLE_NAME, TransactionStatus, TransactionMessage } from "./shared";

export async function handler(event: SQSEvent): Promise<void> {
  for (const record of event.Records) {
    try {
      const message: TransactionMessage = JSON.parse(record.body);
      const { id } = message;

      console.log("pending_event_received", { id, message });

      if (!id) {
        console.log("pending_event_missing_id", { record: record.body });
        continue;
      }

      const now = new Date().toISOString();

      await ddbDoc.send(
        new UpdateCommand({
          TableName: TABLE_NAME,
          Key: { id },
          UpdateExpression: "SET #status = :processing, #updatedAt = :now",
          ConditionExpression: "#status = :pending",
          ExpressionAttributeNames: {
            "#status": "status",
            "#updatedAt": "updatedAt",
          },
          ExpressionAttributeValues: {
            ":pending": TransactionStatus.PENDING,
            ":processing": TransactionStatus.PROCESSING,
            ":now": now,
          },
        })
      );

      console.log("transaction_marked_processing", { id });
    } catch (err: unknown) {
      if (err instanceof ConditionalCheckFailedException) {
        const message = JSON.parse(record.body);
        console.log("pending_event_duplicate_or_already_processed", {
          id: message?.id,
          message: "Transaction is no longer in PENDING status",
        });
        continue;
      }

      console.log("worker_unexpected_error", { error: err, record: record.body });
      throw err;
    }
  }
}
