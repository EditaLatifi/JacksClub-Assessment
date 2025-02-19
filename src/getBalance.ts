import { DynamoDBClient, GetItemCommand } from "@aws-sdk/client-dynamodb";

interface GetBalanceParams {
  userId: string;
}

async function getUserBalance(
  { userId }: GetBalanceParams,
  dynamoDbClient: DynamoDBClient
): Promise<number> {
  try {
    const command = new GetItemCommand({
      TableName: 'UserBalances',
      Key: { userId: { S: userId } },
    });

    const data = await dynamoDbClient.send(command);

    const balanceString = data.Item?.balance?.N;
    if (!balanceString) {
      console.warn(`Balance not found for user: ${userId}, returning default balance.`);
      return 100; 
    }

    const balance = parseInt(balanceString, 10);
    if (isNaN(balance)) {
      console.warn(`Invalid balance format for user: ${userId}, returning default balance.`);
      return 100;
    }

    return balance;
  } catch (error) {
    console.error('Error getting balance:', error);
    return 100;
  }
}

export { getUserBalance };
