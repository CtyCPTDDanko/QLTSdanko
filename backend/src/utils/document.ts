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

  // Serialize number allocation per prefix inside PostgreSQL. Without this,
  // two concurrent transactions can both read the same latest number and
  // then collide on a unique business-code constraint.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${fullPrefix}))`;

  // This generator is shared by documents and all CCDC workflows. Every table
  // containing a generated unique code must participate in the sequence scan.
  const [
    latestGen,
    latestHandover,
    latestToolHandover,
    latestToolRepair,
    latestToolLost,
    latestToolLiquidation,
    latestToolInventory,
    latestToolDamage,
  ] = await Promise.all([
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
    }),
    tx.toolRepairTicket.findFirst({
      where: { repairCode: { startsWith: fullPrefix } },
      orderBy: { repairCode: 'desc' },
      select: { repairCode: true },
    }),
    tx.toolLostReport.findFirst({
      where: { lostCode: { startsWith: fullPrefix } },
      orderBy: { lostCode: 'desc' },
      select: { lostCode: true },
    }),
    tx.toolLiquidationRecord.findFirst({
      where: { liquidationCode: { startsWith: fullPrefix } },
      orderBy: { liquidationCode: 'desc' },
      select: { liquidationCode: true },
    }),
    tx.toolInventoryCheck.findFirst({
      where: { inventoryCode: { startsWith: fullPrefix } },
      orderBy: { inventoryCode: 'desc' },
      select: { inventoryCode: true },
    }),
    tx.toolDamageReport.findFirst({
      where: { reportCode: { startsWith: fullPrefix } },
      orderBy: { reportCode: 'desc' },
      select: { reportCode: true },
    }),
  ]);

  const documentNumbers = [
    latestGen?.documentNo,
    latestHandover?.documentNo,
    latestToolHandover?.documentNo,
    latestToolRepair?.repairCode,
    latestToolLost?.lostCode,
    latestToolLiquidation?.liquidationCode,
    latestToolInventory?.inventoryCode,
    latestToolDamage?.reportCode,
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
