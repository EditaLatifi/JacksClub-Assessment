declare global {
  interface Error {
    code?: string;
    $metadata?: any;
  }
}

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { v4 as uuidv4 } from 'uuid';
import { getUserBalance } from '../getBalance'; 
import { transact } from '../transaction'; 

jest.mock('@aws-sdk/client-dynamodb');
jest.mock('uuid');

const mockDynamoDbClient = {
  send: jest.fn().mockReturnValue(Promise.resolve({})),
} as unknown as DynamoDBClient;

const mockedUuid = 'mocked-uuid';

describe('getUserBalance', () => {
  it('should return the balance from DynamoDB', async () => {
    (mockDynamoDbClient.send as jest.Mock).mockResolvedValueOnce({ Item: { balance: { N: '50' } } });
    const balance = await getUserBalance({ userId: '1' }, mockDynamoDbClient);
    expect(balance).toBe(50);
  });

  it('should return default balance (100) when balance is not found', async () => {
    (mockDynamoDbClient.send as jest.Mock).mockResolvedValueOnce({});
    const balance = await getUserBalance({ userId: '1' }, mockDynamoDbClient);
    expect(balance).toBe(100);
  });
});

describe('transact', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (uuidv4 as jest.Mock).mockReturnValue(mockedUuid);
  });

  it('should handle idempotent requests', async () => {
    const mockData = { Item: { idempotentKey: { S: '1' } } };
    (mockDynamoDbClient.send as jest.Mock).mockResolvedValueOnce(mockData); 
  
    const result = await transact(
      { idempotentKey: '1', userId: '1', amount: 10, type: 'credit' },
      mockDynamoDbClient
    );
  
    expect(result).toBe('Transaction already processed');
  });
  
  

  it('should throw an error if amount is NaN', async () => {
    await expect(transact({ idempotentKey: '1', userId: '1', amount: NaN, type: 'credit' }, mockDynamoDbClient))
      .rejects.toThrow('Amount must be a valid number.');
  });

  it('should process a credit transaction correctly', async () => {
    (mockDynamoDbClient.send as jest.Mock).mockResolvedValueOnce({});
    
    (mockDynamoDbClient.send as jest.Mock).mockResolvedValueOnce({ Item: { balance: { N: '50' } } });
  
    const result = await transact({ idempotentKey: '1', userId: '1', amount: 10, type: 'credit' }, mockDynamoDbClient);
    expect(result).toContain('Transaction processed successfully. New balance: 60');
  });
  
});

