import { DynamoDBClient, GetItemCommand, TransactWriteItemsCommand, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { v4 as uuidv4 } from 'uuid';
import { getUserBalance } from './getBalance';

const dynamoDbClient = new DynamoDBClient({
    region: 'eu-central-1',
  });

interface TransactParams {
  idempotentKey: string;
  userId: string;
  amount: number;
  type: 'credit' | 'debit';
}

const USER_BALANCES_TABLE = 'UserBalances';
const TRANSACTION_HISTORY_TABLE = 'TransactionHistory';

async function checkIdempotency(idempotentKey: string, dynamoDbClient: DynamoDBClient): Promise<boolean> {
  const getItemCommand = new GetItemCommand({
    TableName: TRANSACTION_HISTORY_TABLE,
    Key: {
      idempotentKey: { S: idempotentKey },
    },
  });

  try {
    const data = await dynamoDbClient.send(getItemCommand);
    return !!data.Item;
  } catch (error) {
    console.error('Error checking idempotency:', error);
    return false;
  }
}

async function updateBalanceWithVersion(
  userId: string,
  newBalance: number,
  version: number,
  dynamoDbClient: DynamoDBClient
) {
  const updateCommand = new UpdateItemCommand({
    TableName: USER_BALANCES_TABLE,
    Key: { userId: { S: userId } },
    UpdateExpression: 'set balance = :balance, version = :version',
    ExpressionAttributeValues: {
      ':balance': { N: newBalance.toString() },
      ':version': { N: (version + 1).toString() },
    },
    ConditionExpression: 'version = :version',
  });

  await dynamoDbClient.send(updateCommand);
}

async function transact(
  { idempotentKey, userId, amount, type }: TransactParams,
  dynamoDbClient: DynamoDBClient
): Promise<string> {
  try {
    if (typeof amount !== 'number' || isNaN(amount)) {
      throw new Error('Amount must be a valid number.');
    }

    if (amount <= 0) {
      throw new Error('Amount must be greater than zero.');
    }

    const isProcessed = await checkIdempotency(idempotentKey, dynamoDbClient);
    if (isProcessed) {
      return 'Transaction already processed';
    }

    const balance = await getUserBalance({ userId }, dynamoDbClient);
    console.log(`Retrieved balance for user ${userId}: ${balance}`);

    if (type === 'debit' && balance < amount) {
      throw new Error('Insufficient balance.');
    }

    let newBalance = type === 'credit' ? balance + amount : balance - amount;

    const transactCommand = new TransactWriteItemsCommand({
      TransactItems: [
        {
          Update: {
            TableName: USER_BALANCES_TABLE,
            Key: { userId: { S: userId } },
            UpdateExpression: 'set balance = :balance',
            ExpressionAttributeValues: { ':balance': { N: newBalance.toString() } },
            ConditionExpression: 'attribute_exists(userId)',
          },
        },
        {
          Put: {
            TableName: TRANSACTION_HISTORY_TABLE,
            Item: {
              idempotentKey: { S: idempotentKey },
              userId: { S: userId },
              amount: { N: amount.toString() },
              type: { S: type },
              transactionId: { S: uuidv4() },
              timestamp: { S: new Date().toISOString() },
            },
            ConditionExpression: 'attribute_not_exists(idempotentKey)',
          },
        },
      ],
    });

    await dynamoDbClient.send(transactCommand);
    console.log(`Transaction successfully processed for user ${userId}. New balance: ${newBalance}`);

    return `Transaction processed successfully. New balance: ${newBalance}`;
  } catch (error: unknown) {
    console.error('Transaction failed:', error);
    throw new Error(`Transaction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export { transact };
