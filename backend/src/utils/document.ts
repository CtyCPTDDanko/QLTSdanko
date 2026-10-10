import { Prisma } from '@prisma/client';
import prisma from './prisma';

/**
 * Generates a unique document number with format: PREFIX-YYYYMMDD-XXXX
 * Example: BBBG-20260513-0001
 */
export async function generateDocumentNo(tx: Prisma.TransactionClient, prefix: string = 'BBBG'): Promise<string> {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const dateStr = `${yyyy}${mm}${dd}`;
  const fullPrefix = `${prefix}-${dateStr}`;

  // CCDC handover numbers use this generator too. Include their table so the
  // next sequence does not repeatedly start at 0001.
  const [latestGen, latestHandover, latestToolHandover] = await Promise.all([
    tx.generatedDocument.findFirst({
      where: { documentNo: { startsWith: fullPrefix } },
      orderBy: { documentNo: 'desc' },
      select: { documentNo: true },
    }),
    tx.handoverDocument.findFirst({
      where: { documentNo: { startsWith: fullPrefix } },
      orderBy: { documentNo: 'desc' },
      select: { documentNo: true },
    }),
    tx.toolHandoverDocument.findFirst({
      where: { documentNo: { startsWith: fullPrefix } },
      orderBy: { documentNo: 'desc' },
      select: { documentNo: true },
    })
  ]);

  const documentNumbers = [
    latestGen?.documentNo,
    latestHandover?.documentNo,
    latestToolHandover?.documentNo,
  ].filter((value): value is string => Boolean(value)).sort();
  const latestDocNo = documentNumbers[documentNumbers.length - 1];

  let nextNumber = 1;
  if (latestDocNo) {
    const parts = latestDocNo.split('-');
    const lastNumStr = parts[parts.length - 1];
    const lastNum = parseInt(lastNumStr, 10);
    if (!isNaN(lastNum)) {
      nextNumber = lastNum + 1;
    }
  }

  const sequence = String(nextNumber).padStart(4, '0');
  return `${fullPrefix}-${sequence}`;
}

/**
 * Creates a GeneratedDocument with retry logic for unique constraint conflicts
 */
export async function createDocumentWithRetry(
  data: {
    templateCode: string;
    documentType: string;
    entityType?: string;
    entityId?: number;
    fileName?: string;
    fileUrl?: string;
    createdById?: number;
    createdBy?: string;
    note?: string;
  },
  maxAttempts = 5
) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        // Map template code to prefix if needed
        let prefix = 'DOC';
        if (data.documentType === 'ASSET_HANDOVER') prefix = 'BBBG';
        else if (data.documentType === 'ASSET_TRANSFER') prefix = 'BDC';
        else if (data.documentType === 'ASSET_RECALL') prefix = 'BTH';
        else if (data.templateCode.startsWith('BM')) prefix = data.templateCode;

        const documentNo = await generateDocumentNo(tx, prefix);

        return await tx.generatedDocument.create({
          data: {
            ...data,
            documentNo,
            status: 'COMPLETED'
          },
        });
      });
    } catch (error: any) {
      // P2002 is Prisma's unique constraint error code
      const isUniqueError = error.code === 'P2002' && error.meta?.target?.includes('documentNo');
      if (!isUniqueError || attempt === maxAttempts) {
        throw error;
      }
      // Brief delay before retry could be added here if needed, 
      // but usually the next attempt will get a new sequence number immediately.
    }
  }
}
