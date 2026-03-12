import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import type { SQSEvent } from "aws-lambda";
import { ddbDoc, TABLE_NAME, TransactionStatus, TransactionMessage } from "./shared";

function determineOutcome(amount: number): "COMPLETED" | "FAILED" {
  const amountStr = String(Math.abs(amount)).replace(/[^0-9]/g, "");
  const firstDigit = parseInt(amountStr.charAt(0), 10);

  if (isNaN(firstDigit)) {
    return TransactionStatus.FAILED;
  }

  return firstDigit % 2 === 0
    ? TransactionStatus.COMPLETED
    : TransactionStatus.FAILED;
}

export async function handler(event: SQSEvent): Promise<void> {
  for (const record of event.Records) {
    try {
      const message: TransactionMessage = JSON.parse(record.body);
      const { id, amount } = message;

      console.log("processing_event_received", { id, amount, message });

      if (!id) {
        console.log("processing_event_missing_id", { record: record.body });
        continue;
      }

      const newStatus = determineOutcome(amount);
      const now = new Date().toISOString();

      await ddbDoc.send(
        new UpdateCommand({
          TableName: TABLE_NAME,
          Key: { id },
          UpdateExpression: "SET #status = :newStatus, #updatedAt = :now",
          ConditionExpression: "#status = :processing",
          ExpressionAttributeNames: {
            "#status": "status",
            "#updatedAt": "updatedAt",
          },
          ExpressionAttributeValues: {
            ":processing": TransactionStatus.PROCESSING,
            ":newStatus": newStatus,
            ":now": now,
          },
        })
      );

      if (newStatus === TransactionStatus.COMPLETED) {
        console.log("transaction_completed", { id });
      } else {
        console.log("transaction_failed", { id });
      }
    } catch (err: unknown) {
      if (err instanceof ConditionalCheckFailedException) {
        const message = JSON.parse(record.body);
        console.log("processing_event_duplicate_or_already_processed", {
          id: message?.id,
          message: "Transaction is no longer in PROCESSING status",
        });
        continue;
      }

      console.log("worker_unexpected_error", { error: err, record: record.body });
      throw err;
    }
  }
}
