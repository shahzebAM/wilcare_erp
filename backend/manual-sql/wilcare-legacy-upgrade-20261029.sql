-- Reviewed one-time upgrade of Wilcare's existing 24-table legacy database.
-- Generated from the actual restored Wilcare catalog to schema.prisma.
-- Apply only after a verified backup, catalog/precondition review and clone tests.
-- Run as one transaction; a repeated invocation fails and rolls back.
-- Preserves every original column, including Attendance.holidayPercentage.
-- No existing records are inserted, updated, deleted or recalculated.
-- Historical Prisma migrations are not replayed or marked applied by this script.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';
SET LOCAL search_path = public, pg_catalog;

-- AlterTable
ALTER TABLE "Attendance" ADD COLUMN     "breakIn" TEXT,
ADD COLUMN     "breakOut" TEXT,
ADD COLUMN     "lunchEnd" TEXT,
ADD COLUMN     "lunchOverrideMinutes" INTEGER,
ADD COLUMN     "lunchStart" TEXT;

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "tin" TEXT;

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "importFileId" TEXT,
ADD COLUMN     "productId" INTEGER,
ADD COLUMN     "regulatoryStatus" TEXT NOT NULL DEFAULT 'RECEIVED',
ADD COLUMN     "shipmentId" TEXT;

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "payrollProfile" JSONB,
ALTER COLUMN "company" SET DEFAULT 'Wilcare';

-- AlterTable
ALTER TABLE "InventoryMovement" ADD COLUMN     "binId" TEXT,
ADD COLUMN     "lotId" TEXT,
ADD COLUMN     "serialNumber" TEXT;

-- AlterTable
ALTER TABLE "Payroll" ADD COLUMN     "attendanceSummary" JSONB;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "cmdn" TEXT,
ADD COLUMN     "expiryControlled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "landedCostReference" DECIMAL(18,6),
ADD COLUMN     "qrCodeUrl" TEXT,
ADD COLUMN     "serialControlled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "lunchEnd" TEXT NOT NULL DEFAULT '13:00',
ADD COLUMN     "lunchStart" TEXT NOT NULL DEFAULT '12:00';

-- CreateTable
CREATE TABLE "Quotation" (
    "id" TEXT NOT NULL,
    "qtNumber" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Draft',
    "subtotal" DOUBLE PRECISION NOT NULL,
    "vatApplied" BOOLEAN NOT NULL DEFAULT false,
    "vatRate" DOUBLE PRECISION NOT NULL DEFAULT 0.12,
    "vatAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "grandTotal" DOUBLE PRECISION NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Quotation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuotationItem" (
    "id" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "productId" INTEGER NOT NULL,
    "sku" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "requestedQty" INTEGER NOT NULL,
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "lineTotal" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "QuotationItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackingList" (
    "id" TEXT NOT NULL,
    "plNumber" TEXT NOT NULL,
    "referenceOs" TEXT,
    "company" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Generated',
    "subtotal" DOUBLE PRECISION NOT NULL,
    "vatApplied" BOOLEAN NOT NULL DEFAULT false,
    "vatRate" DOUBLE PRECISION NOT NULL DEFAULT 0.12,
    "vatAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "grandTotal" DOUBLE PRECISION NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PackingList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackingListItem" (
    "id" TEXT NOT NULL,
    "packingListId" TEXT NOT NULL,
    "productId" INTEGER NOT NULL,
    "sku" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "requestedQty" INTEGER NOT NULL,
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "lineTotal" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "PackingListItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyNavigation" (
    "company" TEXT NOT NULL,
    "groups" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedBy" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyNavigation_pkey" PRIMARY KEY ("company")
);

-- CreateTable
CREATE TABLE "ImportSequence" (
    "key" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ImportSequence_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "PurchaseRequisition" (
    "id" TEXT NOT NULL,
    "prNumber" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "neededBy" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'Draft',
    "rejectionReason" TEXT,
    "createdBy" TEXT NOT NULL,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "purchaseOrderId" TEXT,
    "selectedQuotationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseRequisition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseRequisitionItem" (
    "id" TEXT NOT NULL,
    "requisitionId" TEXT NOT NULL,
    "productId" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "PurchaseRequisitionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierQuotation" (
    "id" TEXT NOT NULL,
    "requisitionId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'PHP',
    "exchangeRate" DECIMAL(18,6) NOT NULL,
    "leadTimeDays" INTEGER NOT NULL,
    "paymentTerms" TEXT NOT NULL,
    "validUntil" TIMESTAMP(3),
    "notes" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierQuotation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierQuotationItem" (
    "id" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "requisitionItemId" TEXT NOT NULL,
    "unitCost" DECIMAL(18,6) NOT NULL,
    "minimumOrderQty" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "SupplierQuotationItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportFile" (
    "id" TEXT NOT NULL,
    "importNumber" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Open',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shipment" (
    "id" TEXT NOT NULL,
    "shipmentNumber" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "importFileId" TEXT NOT NULL,
    "forwarder" TEXT,
    "carrier" TEXT,
    "mode" TEXT NOT NULL,
    "blAwbNumber" TEXT,
    "containerReference" TEXT,
    "etd" TIMESTAMP(3),
    "eta" TIMESTAMP(3),
    "revisedEta" TIMESTAMP(3),
    "actualArrival" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'Planned',
    "notes" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipmentLine" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "purchaseOrderItemId" TEXT NOT NULL,
    "shippedQty" INTEGER NOT NULL,
    "clearedQty" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ShipmentLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipmentClearance" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "broker" TEXT,
    "declarationReference" TEXT,
    "entryReference" TEXT,
    "clearanceDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "updatedBy" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShipmentClearance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportExpense" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'PHP',
    "amount" DECIMAL(18,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Estimated',
    "invoiceReference" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportExpense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoodsReceipt" (
    "id" TEXT NOT NULL,
    "grnNumber" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GoodsReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoodsReceiptLine" (
    "id" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "shipmentLineId" TEXT NOT NULL,
    "receivedQty" INTEGER NOT NULL,
    "acceptedQty" INTEGER NOT NULL,
    "rejectedQty" INTEGER NOT NULL,
    "heldQty" INTEGER NOT NULL,
    "placedQty" INTEGER NOT NULL DEFAULT 0,
    "batchNumber" TEXT,
    "expirationDate" TIMESTAMP(3),
    "photos" JSONB NOT NULL DEFAULT '[]',
    "notes" TEXT,
    "inspectedBy" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoodsReceiptLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WarehouseBin" (
    "id" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "building" TEXT NOT NULL,
    "floor" TEXT NOT NULL,
    "zone" TEXT NOT NULL,
    "rack" TEXT NOT NULL,
    "shelf" TEXT NOT NULL,
    "bin" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WarehouseBin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WarehouseLot" (
    "id" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "productId" INTEGER NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "warehouseStockId" TEXT,
    "binId" TEXT,
    "receiptLineId" TEXT,
    "batchNumber" TEXT,
    "serialNumber" TEXT,
    "expirationDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "reservedQty" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "WarehouseLot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CycleCount" (
    "id" TEXT NOT NULL,
    "adjNumber" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Draft',
    "notes" TEXT,
    "recountReason" TEXT,
    "createdBy" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CycleCount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CycleCountLine" (
    "id" TEXT NOT NULL,
    "cycleCountId" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "expectedQty" INTEGER NOT NULL,
    "expectedReservedQty" INTEGER NOT NULL,
    "expectedVersion" INTEGER NOT NULL,
    "countedQty" INTEGER,
    "countedBy" TEXT,
    "countedAt" TIMESTAMP(3),

    CONSTRAINT "CycleCountLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerOrder" (
    "id" TEXT NOT NULL,
    "soNumber" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "hospitalPoNumber" TEXT,
    "sourceOrderSlipId" TEXT,
    "sourceOsNumber" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Draft',
    "notes" TEXT,
    "createdBy" TEXT NOT NULL,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerOrderLine" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "deliveredQty" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CustomerOrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockReservation" (
    "id" TEXT NOT NULL,
    "orderLineId" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "dispatchedQty" INTEGER NOT NULL DEFAULT 0,
    "releasedQty" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockReservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncomingAllocation" (
    "id" TEXT NOT NULL,
    "orderLineId" TEXT NOT NULL,
    "shipmentLineId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IncomingAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Delivery" (
    "id" TEXT NOT NULL,
    "delNumber" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Draft',
    "scheduledAt" TIMESTAMP(3),
    "carrier" TEXT,
    "trackingNumber" TEXT,
    "notes" TEXT,
    "dispatchedAt" TIMESTAMP(3),
    "dispatchedBy" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Delivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryItem" (
    "id" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "orderLineId" TEXT NOT NULL,
    "productId" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "deliveredQty" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DeliveryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryPick" (
    "id" TEXT NOT NULL,
    "deliveryItemId" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "verifiedQty" INTEGER NOT NULL DEFAULT 0,
    "verifiedBy" TEXT,
    "verifiedAt" TIMESTAMP(3),

    CONSTRAINT "DeliveryPick_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliverySource" (
    "id" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "documentNumber" TEXT NOT NULL,
    "cancelledAt" TIMESTAMP(3),
    "deliveryId" TEXT NOT NULL,

    CONSTRAINT "DeliverySource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryPod" (
    "id" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "receiptUrl" TEXT,
    "documentId" INTEGER,
    "notes" TEXT,
    "items" JSONB NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryPod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LandedCost" (
    "id" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "allocationMethod" TEXT NOT NULL,
    "baseCurrency" TEXT NOT NULL DEFAULT 'PHP',
    "data" JSONB NOT NULL,
    "total" DECIMAL(18,2) NOT NULL,
    "createdBy" TEXT NOT NULL,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LandedCost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductCostHistory" (
    "id" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "productId" INTEGER NOT NULL,
    "landedCostId" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitCost" DECIMAL(18,6) NOT NULL,
    "approvedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductCostHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceDocument" (
    "id" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "sourceKey" TEXT,
    "deliveryId" TEXT,
    "relatedDocumentId" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'PHP',
    "exchangeRate" DECIMAL(18,6) NOT NULL,
    "issueDate" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "subtotal" DECIMAL(18,2) NOT NULL,
    "taxAmount" DECIMAL(18,2) NOT NULL,
    "total" DECIMAL(18,2) NOT NULL,
    "data" JSONB NOT NULL,
    "createdBy" TEXT NOT NULL,
    "postedBy" TEXT,
    "postedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancePayment" (
    "id" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "method" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'POSTED',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancePayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceAllocation" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "FinanceAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentRequest" (
    "id" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "data" JSONB NOT NULL,
    "notes" TEXT,
    "createdBy" TEXT NOT NULL,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "paymentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerAccount" (
    "id" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountingJournal" (
    "id" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "memo" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'POSTED',
    "postedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountingJournal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerEntry" (
    "id" TEXT NOT NULL,
    "journalId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "debit" DECIMAL(18,2) NOT NULL,
    "credit" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashAccountSetting" (
    "id" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL,
    "actor" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashAccountSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashFlowClassification" (
    "id" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "ledgerEntryId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "operating" DECIMAL(18,2) NOT NULL,
    "investing" DECIMAL(18,2) NOT NULL,
    "financing" DECIMAL(18,2) NOT NULL,
    "transfer" DECIMAL(18,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashFlowClassification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountingMapping" (
    "id" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountingMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankReconciliation" (
    "id" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "statementDate" TIMESTAMP(3) NOT NULL,
    "openingBalance" DECIMAL(18,2) NOT NULL,
    "closingBalance" DECIMAL(18,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdBy" TEXT NOT NULL,
    "completedBy" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankReconciliation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankStatementLine" (
    "id" TEXT NOT NULL,
    "reconciliationId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "reference" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "ledgerEntryId" TEXT,

    CONSTRAINT "BankStatementLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceAsset" (
    "id" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "productId" INTEGER NOT NULL,
    "customerId" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "serialNumber" TEXT NOT NULL,
    "soldAt" TIMESTAMP(3) NOT NULL,
    "warrantyUntil" TIMESTAMP(3),
    "nextMaintenanceAt" TIMESTAMP(3),
    "intervalMonths" INTEGER NOT NULL DEFAULT 6,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeviceAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceVisit" (
    "id" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "dueDate" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "technician" TEXT NOT NULL,
    "notes" TEXT,
    "parts" JSONB NOT NULL DEFAULT '[]',
    "cost" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceVisit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ErpAuditLog" (
    "id" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "actorId" INTEGER NOT NULL,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "details" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ErpAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Quotation_qtNumber_key" ON "Quotation"("qtNumber");

-- CreateIndex
CREATE INDEX "Quotation_company_idx" ON "Quotation"("company");

-- CreateIndex
CREATE UNIQUE INDEX "PackingList_plNumber_key" ON "PackingList"("plNumber");

-- CreateIndex
CREATE INDEX "PackingList_company_idx" ON "PackingList"("company");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseRequisition_prNumber_key" ON "PurchaseRequisition"("prNumber");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseRequisition_purchaseOrderId_key" ON "PurchaseRequisition"("purchaseOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseRequisition_selectedQuotationId_key" ON "PurchaseRequisition"("selectedQuotationId");

-- CreateIndex
CREATE INDEX "PurchaseRequisition_company_status_idx" ON "PurchaseRequisition"("company", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseRequisitionItem_requisitionId_productId_key" ON "PurchaseRequisitionItem"("requisitionId", "productId");

-- CreateIndex
CREATE INDEX "SupplierQuotation_requisitionId_idx" ON "SupplierQuotation"("requisitionId");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierQuotationItem_quotationId_requisitionItemId_key" ON "SupplierQuotationItem"("quotationId", "requisitionItemId");

-- CreateIndex
CREATE UNIQUE INDEX "ImportFile_importNumber_key" ON "ImportFile"("importNumber");

-- CreateIndex
CREATE INDEX "ImportFile_company_status_idx" ON "ImportFile"("company", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Shipment_shipmentNumber_key" ON "Shipment"("shipmentNumber");

-- CreateIndex
CREATE INDEX "Shipment_company_status_idx" ON "Shipment"("company", "status");

-- CreateIndex
CREATE INDEX "ShipmentLine_purchaseOrderItemId_idx" ON "ShipmentLine"("purchaseOrderItemId");

-- CreateIndex
CREATE UNIQUE INDEX "ShipmentLine_shipmentId_purchaseOrderItemId_key" ON "ShipmentLine"("shipmentId", "purchaseOrderItemId");

-- CreateIndex
CREATE UNIQUE INDEX "ShipmentClearance_shipmentId_key" ON "ShipmentClearance"("shipmentId");

-- CreateIndex
CREATE INDEX "ImportExpense_shipmentId_status_idx" ON "ImportExpense"("shipmentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "GoodsReceipt_grnNumber_key" ON "GoodsReceipt"("grnNumber");

-- CreateIndex
CREATE INDEX "GoodsReceipt_company_shipmentId_idx" ON "GoodsReceipt"("company", "shipmentId");

-- CreateIndex
CREATE INDEX "GoodsReceiptLine_shipmentLineId_idx" ON "GoodsReceiptLine"("shipmentLineId");

-- CreateIndex
CREATE UNIQUE INDEX "GoodsReceiptLine_receiptId_shipmentLineId_key" ON "GoodsReceiptLine"("receiptId", "shipmentLineId");

-- CreateIndex
CREATE INDEX "WarehouseBin_company_warehouseId_idx" ON "WarehouseBin"("company", "warehouseId");

-- CreateIndex
CREATE UNIQUE INDEX "WarehouseBin_company_code_key" ON "WarehouseBin"("company", "code");

-- CreateIndex
CREATE INDEX "WarehouseLot_company_productId_warehouseId_status_idx" ON "WarehouseLot"("company", "productId", "warehouseId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "WarehouseLot_company_productId_serialNumber_key" ON "WarehouseLot"("company", "productId", "serialNumber");

-- CreateIndex
CREATE UNIQUE INDEX "CycleCount_adjNumber_key" ON "CycleCount"("adjNumber");

-- CreateIndex
CREATE INDEX "CycleCount_company_status_idx" ON "CycleCount"("company", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CycleCountLine_cycleCountId_lotId_key" ON "CycleCountLine"("cycleCountId", "lotId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerOrder_soNumber_key" ON "CustomerOrder"("soNumber");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerOrder_sourceOrderSlipId_key" ON "CustomerOrder"("sourceOrderSlipId");

-- CreateIndex
CREATE INDEX "CustomerOrder_company_status_idx" ON "CustomerOrder"("company", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerOrderLine_orderId_productId_key" ON "CustomerOrderLine"("orderId", "productId");

-- CreateIndex
CREATE INDEX "StockReservation_orderLineId_lotId_idx" ON "StockReservation"("orderLineId", "lotId");

-- CreateIndex
CREATE INDEX "IncomingAllocation_shipmentLineId_idx" ON "IncomingAllocation"("shipmentLineId");

-- CreateIndex
CREATE UNIQUE INDEX "IncomingAllocation_orderLineId_shipmentLineId_key" ON "IncomingAllocation"("orderLineId", "shipmentLineId");

-- CreateIndex
CREATE UNIQUE INDEX "Delivery_delNumber_key" ON "Delivery"("delNumber");

-- CreateIndex
CREATE INDEX "Delivery_company_status_idx" ON "Delivery"("company", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryItem_deliveryId_orderLineId_key" ON "DeliveryItem"("deliveryId", "orderLineId");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryPick_deliveryItemId_reservationId_key" ON "DeliveryPick"("deliveryItemId", "reservationId");

-- CreateIndex
CREATE UNIQUE INDEX "DeliverySource_company_sourceType_sourceId_key" ON "DeliverySource"("company", "sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "DeliveryPod_deliveryId_idx" ON "DeliveryPod"("deliveryId");

-- CreateIndex
CREATE UNIQUE INDEX "LandedCost_number_key" ON "LandedCost"("number");

-- CreateIndex
CREATE INDEX "LandedCost_company_status_idx" ON "LandedCost"("company", "status");

-- CreateIndex
CREATE INDEX "LandedCost_shipmentId_idx" ON "LandedCost"("shipmentId");

-- CreateIndex
CREATE INDEX "ProductCostHistory_company_productId_createdAt_idx" ON "ProductCostHistory"("company", "productId", "createdAt");

-- CreateIndex
CREATE INDEX "ProductCostHistory_shipmentId_idx" ON "ProductCostHistory"("shipmentId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductCostHistory_landedCostId_productId_key" ON "ProductCostHistory"("landedCostId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceDocument_number_key" ON "FinanceDocument"("number");

-- CreateIndex
CREATE INDEX "FinanceDocument_company_direction_status_dueDate_idx" ON "FinanceDocument"("company", "direction", "status", "dueDate");

-- CreateIndex
CREATE INDEX "FinanceDocument_company_partyId_idx" ON "FinanceDocument"("company", "partyId");

-- CreateIndex
CREATE INDEX "FinanceDocument_deliveryId_idx" ON "FinanceDocument"("deliveryId");

-- CreateIndex
CREATE INDEX "FinanceDocument_relatedDocumentId_idx" ON "FinanceDocument"("relatedDocumentId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceDocument_company_sourceKey_key" ON "FinanceDocument"("company", "sourceKey");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceDocument_id_company_direction_partyId_key" ON "FinanceDocument"("id", "company", "direction", "partyId");

-- CreateIndex
CREATE UNIQUE INDEX "FinancePayment_number_key" ON "FinancePayment"("number");

-- CreateIndex
CREATE INDEX "FinancePayment_company_direction_partyId_idx" ON "FinancePayment"("company", "direction", "partyId");

-- CreateIndex
CREATE INDEX "FinancePayment_company_paidAt_idx" ON "FinancePayment"("company", "paidAt");

-- CreateIndex
CREATE UNIQUE INDEX "FinancePayment_company_idempotencyKey_key" ON "FinancePayment"("company", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "FinancePayment_id_company_direction_partyId_key" ON "FinancePayment"("id", "company", "direction", "partyId");

-- CreateIndex
CREATE INDEX "FinanceAllocation_documentId_idx" ON "FinanceAllocation"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceAllocation_paymentId_documentId_key" ON "FinanceAllocation"("paymentId", "documentId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentRequest_number_key" ON "PaymentRequest"("number");

-- CreateIndex
CREATE INDEX "PaymentRequest_company_status_dueDate_idx" ON "PaymentRequest"("company", "status", "dueDate");

-- CreateIndex
CREATE INDEX "PaymentRequest_supplierId_idx" ON "PaymentRequest"("supplierId");

-- CreateIndex
CREATE INDEX "PaymentRequest_paymentId_idx" ON "PaymentRequest"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerAccount_company_code_key" ON "LedgerAccount"("company", "code");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerAccount_id_company_key" ON "LedgerAccount"("id", "company");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingJournal_number_key" ON "AccountingJournal"("number");

-- CreateIndex
CREATE INDEX "AccountingJournal_company_date_idx" ON "AccountingJournal"("company", "date");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingJournal_company_sourceKey_key" ON "AccountingJournal"("company", "sourceKey");

-- CreateIndex
CREATE INDEX "LedgerEntry_journalId_idx" ON "LedgerEntry"("journalId");

-- CreateIndex
CREATE INDEX "LedgerEntry_accountId_idx" ON "LedgerEntry"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerEntry_id_accountId_key" ON "LedgerEntry"("id", "accountId");

-- CreateIndex
CREATE INDEX "CashAccountSetting_company_createdAt_idx" ON "CashAccountSetting"("company", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CashAccountSetting_accountId_version_key" ON "CashAccountSetting"("accountId", "version");

-- CreateIndex
CREATE INDEX "CashFlowClassification_company_createdAt_idx" ON "CashFlowClassification"("company", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CashFlowClassification_ledgerEntryId_version_key" ON "CashFlowClassification"("ledgerEntryId", "version");

-- CreateIndex
CREATE INDEX "AccountingMapping_accountId_idx" ON "AccountingMapping"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingMapping_company_kind_sourceId_key" ON "AccountingMapping"("company", "kind", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "BankReconciliation_number_key" ON "BankReconciliation"("number");

-- CreateIndex
CREATE INDEX "BankReconciliation_company_status_idx" ON "BankReconciliation"("company", "status");

-- CreateIndex
CREATE INDEX "BankReconciliation_accountId_idx" ON "BankReconciliation"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "BankStatementLine_ledgerEntryId_key" ON "BankStatementLine"("ledgerEntryId");

-- CreateIndex
CREATE INDEX "BankStatementLine_reconciliationId_idx" ON "BankStatementLine"("reconciliationId");

-- CreateIndex
CREATE INDEX "DeviceAsset_company_nextMaintenanceAt_idx" ON "DeviceAsset"("company", "nextMaintenanceAt");

-- CreateIndex
CREATE INDEX "DeviceAsset_productId_idx" ON "DeviceAsset"("productId");

-- CreateIndex
CREATE INDEX "DeviceAsset_customerId_idx" ON "DeviceAsset"("customerId");

-- CreateIndex
CREATE INDEX "DeviceAsset_deliveryId_idx" ON "DeviceAsset"("deliveryId");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceAsset_company_serialNumber_key" ON "DeviceAsset"("company", "serialNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceVisit_number_key" ON "ServiceVisit"("number");

-- CreateIndex
CREATE INDEX "ServiceVisit_company_status_dueDate_idx" ON "ServiceVisit"("company", "status", "dueDate");

-- CreateIndex
CREATE INDEX "ServiceVisit_assetId_idx" ON "ServiceVisit"("assetId");

-- CreateIndex
CREATE INDEX "ErpAuditLog_company_createdAt_idx" ON "ErpAuditLog"("company", "createdAt");

-- CreateIndex
CREATE INDEX "ErpAuditLog_company_entityType_entityId_idx" ON "ErpAuditLog"("company", "entityType", "entityId");

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_importFileId_fkey" FOREIGN KEY ("importFileId") REFERENCES "ImportFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "WarehouseLot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_binId_fkey" FOREIGN KEY ("binId") REFERENCES "WarehouseBin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationItem" ADD CONSTRAINT "QuotationItem_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationItem" ADD CONSTRAINT "QuotationItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackingList" ADD CONSTRAINT "PackingList_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackingListItem" ADD CONSTRAINT "PackingListItem_packingListId_fkey" FOREIGN KEY ("packingListId") REFERENCES "PackingList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackingListItem" ADD CONSTRAINT "PackingListItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyNavigation" ADD CONSTRAINT "CompanyNavigation_company_fkey" FOREIGN KEY ("company") REFERENCES "Company"("name") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseRequisition" ADD CONSTRAINT "PurchaseRequisition_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseRequisition" ADD CONSTRAINT "PurchaseRequisition_selectedQuotationId_fkey" FOREIGN KEY ("selectedQuotationId") REFERENCES "SupplierQuotation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseRequisitionItem" ADD CONSTRAINT "PurchaseRequisitionItem_requisitionId_fkey" FOREIGN KEY ("requisitionId") REFERENCES "PurchaseRequisition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseRequisitionItem" ADD CONSTRAINT "PurchaseRequisitionItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierQuotation" ADD CONSTRAINT "SupplierQuotation_requisitionId_fkey" FOREIGN KEY ("requisitionId") REFERENCES "PurchaseRequisition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierQuotation" ADD CONSTRAINT "SupplierQuotation_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierQuotationItem" ADD CONSTRAINT "SupplierQuotationItem_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "SupplierQuotation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierQuotationItem" ADD CONSTRAINT "SupplierQuotationItem_requisitionItemId_fkey" FOREIGN KEY ("requisitionItemId") REFERENCES "PurchaseRequisitionItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_importFileId_fkey" FOREIGN KEY ("importFileId") REFERENCES "ImportFile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentLine" ADD CONSTRAINT "ShipmentLine_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentLine" ADD CONSTRAINT "ShipmentLine_purchaseOrderItemId_fkey" FOREIGN KEY ("purchaseOrderItemId") REFERENCES "PurchaseOrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentClearance" ADD CONSTRAINT "ShipmentClearance_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportExpense" ADD CONSTRAINT "ImportExpense_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceipt" ADD CONSTRAINT "GoodsReceipt_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceiptLine" ADD CONSTRAINT "GoodsReceiptLine_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "GoodsReceipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceiptLine" ADD CONSTRAINT "GoodsReceiptLine_shipmentLineId_fkey" FOREIGN KEY ("shipmentLineId") REFERENCES "ShipmentLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarehouseLot" ADD CONSTRAINT "WarehouseLot_warehouseStockId_fkey" FOREIGN KEY ("warehouseStockId") REFERENCES "WarehouseStock"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarehouseLot" ADD CONSTRAINT "WarehouseLot_binId_fkey" FOREIGN KEY ("binId") REFERENCES "WarehouseBin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarehouseLot" ADD CONSTRAINT "WarehouseLot_receiptLineId_fkey" FOREIGN KEY ("receiptLineId") REFERENCES "GoodsReceiptLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CycleCountLine" ADD CONSTRAINT "CycleCountLine_cycleCountId_fkey" FOREIGN KEY ("cycleCountId") REFERENCES "CycleCount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CycleCountLine" ADD CONSTRAINT "CycleCountLine_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "WarehouseLot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerOrderLine" ADD CONSTRAINT "CustomerOrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "CustomerOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_orderLineId_fkey" FOREIGN KEY ("orderLineId") REFERENCES "CustomerOrderLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "WarehouseLot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomingAllocation" ADD CONSTRAINT "IncomingAllocation_orderLineId_fkey" FOREIGN KEY ("orderLineId") REFERENCES "CustomerOrderLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "CustomerOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryItem" ADD CONSTRAINT "DeliveryItem_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "Delivery"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryItem" ADD CONSTRAINT "DeliveryItem_orderLineId_fkey" FOREIGN KEY ("orderLineId") REFERENCES "CustomerOrderLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryPick" ADD CONSTRAINT "DeliveryPick_deliveryItemId_fkey" FOREIGN KEY ("deliveryItemId") REFERENCES "DeliveryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryPick" ADD CONSTRAINT "DeliveryPick_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "StockReservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryPick" ADD CONSTRAINT "DeliveryPick_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "WarehouseLot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliverySource" ADD CONSTRAINT "DeliverySource_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "Delivery"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryPod" ADD CONSTRAINT "DeliveryPod_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "Delivery"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LandedCost" ADD CONSTRAINT "LandedCost_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductCostHistory" ADD CONSTRAINT "ProductCostHistory_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductCostHistory" ADD CONSTRAINT "ProductCostHistory_landedCostId_fkey" FOREIGN KEY ("landedCostId") REFERENCES "LandedCost"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductCostHistory" ADD CONSTRAINT "ProductCostHistory_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceDocument" ADD CONSTRAINT "FinanceDocument_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "Delivery"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceDocument" ADD CONSTRAINT "FinanceDocument_relatedDocumentId_fkey" FOREIGN KEY ("relatedDocumentId") REFERENCES "FinanceDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceAllocation" ADD CONSTRAINT "FinanceAllocation_paymentId_company_direction_partyId_fkey" FOREIGN KEY ("paymentId", "company", "direction", "partyId") REFERENCES "FinancePayment"("id", "company", "direction", "partyId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "FinanceAllocation" ADD CONSTRAINT "FinanceAllocation_documentId_company_direction_partyId_fkey" FOREIGN KEY ("documentId", "company", "direction", "partyId") REFERENCES "FinanceDocument"("id", "company", "direction", "partyId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "PaymentRequest" ADD CONSTRAINT "PaymentRequest_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRequest" ADD CONSTRAINT "PaymentRequest_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "FinancePayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "AccountingJournal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "LedgerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashAccountSetting" ADD CONSTRAINT "CashAccountSetting_accountId_company_fkey" FOREIGN KEY ("accountId", "company") REFERENCES "LedgerAccount"("id", "company") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "CashFlowClassification" ADD CONSTRAINT "CashFlowClassification_entry_fkey" FOREIGN KEY ("ledgerEntryId", "accountId") REFERENCES "LedgerEntry"("id", "accountId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "CashFlowClassification" ADD CONSTRAINT "CashFlowClassification_account_fkey" FOREIGN KEY ("accountId", "company") REFERENCES "LedgerAccount"("id", "company") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "AccountingMapping" ADD CONSTRAINT "AccountingMapping_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "LedgerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankReconciliation" ADD CONSTRAINT "BankReconciliation_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "LedgerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankStatementLine" ADD CONSTRAINT "BankStatementLine_reconciliationId_fkey" FOREIGN KEY ("reconciliationId") REFERENCES "BankReconciliation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankStatementLine" ADD CONSTRAINT "BankStatementLine_ledgerEntryId_fkey" FOREIGN KEY ("ledgerEntryId") REFERENCES "LedgerEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceAsset" ADD CONSTRAINT "DeviceAsset_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceAsset" ADD CONSTRAINT "DeviceAsset_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceAsset" ADD CONSTRAINT "DeviceAsset_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "Delivery"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceVisit" ADD CONSTRAINT "ServiceVisit_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "DeviceAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Physical quantities include reservations; each serial identifies at most one unit.
ALTER TABLE "WarehouseLot" ADD CONSTRAINT "WarehouseLot_balances_check" CHECK ("quantity" >= 0 AND "reservedQty" >= 0 AND "reservedQty" <= "quantity" AND "version" >= 0);
ALTER TABLE "WarehouseLot" ADD CONSTRAINT "WarehouseLot_serial_check" CHECK ("serialNumber" IS NULL OR "quantity" <= 1);
ALTER TABLE "WarehouseLot" ADD CONSTRAINT "WarehouseLot_status_check" CHECK ("status" IN ('AVAILABLE', 'QUARANTINE', 'DAMAGED', 'REJECTED'));
ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_balances_check" CHECK ("quantity" > 0 AND "dispatchedQty" >= 0 AND "releasedQty" >= 0 AND "dispatchedQty" + "releasedQty" <= "quantity");
ALTER TABLE "CustomerOrderLine" ADD CONSTRAINT "CustomerOrderLine_balances_check" CHECK ("quantity" > 0 AND "deliveredQty" >= 0 AND "deliveredQty" <= "quantity");
ALTER TABLE "DeliveryItem" ADD CONSTRAINT "DeliveryItem_balances_check" CHECK ("quantity" > 0 AND "deliveredQty" >= 0 AND "deliveredQty" <= "quantity");
ALTER TABLE "DeliveryPick" ADD CONSTRAINT "DeliveryPick_balances_check" CHECK ("quantity" > 0 AND "verifiedQty" >= 0 AND "verifiedQty" <= "quantity");
ALTER TABLE "IncomingAllocation" ADD CONSTRAINT "IncomingAllocation_quantity_check" CHECK ("quantity" > 0);
ALTER TABLE "CycleCountLine" ADD CONSTRAINT "CycleCountLine_balances_check" CHECK ("expectedQty" >= 0 AND "expectedReservedQty" >= 0 AND "expectedReservedQty" <= "expectedQty" AND ("countedQty" IS NULL OR "countedQty" >= 0));


-- Financial controls also apply when records are changed outside the HTTP API.
ALTER TABLE "LedgerAccount" ADD CONSTRAINT "LedgerAccount_type_check"
  CHECK ("type" IN ('ASSET','LIABILITY','EQUITY','REVENUE','EXPENSE'));
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_amount_check"
  CHECK (("debit" > 0 AND "credit" = 0) OR ("credit" > 0 AND "debit" = 0));
ALTER TABLE "AccountingJournal" ADD CONSTRAINT "AccountingJournal_status_check" CHECK ("status" = 'POSTED');
ALTER TABLE "FinanceDocument" ADD CONSTRAINT "FinanceDocument_values_check"
  CHECK ("kind" IN ('INVOICE','BILL','CREDIT_MEMO','DEBIT_MEMO') AND "direction" IN ('AR','AP')
    AND "status" IN ('DRAFT','POSTED','VOID') AND "exchangeRate" > 0
    AND "subtotal" >= 0 AND "taxAmount" >= 0 AND "total" = "subtotal" + "taxAmount");
ALTER TABLE "FinancePayment" ADD CONSTRAINT "FinancePayment_values_check"
  CHECK ("direction" IN ('AR','AP') AND "amount" > 0 AND "status" = 'POSTED');
ALTER TABLE "FinanceAllocation" ADD CONSTRAINT "FinanceAllocation_amount_check" CHECK ("amount" > 0);
ALTER TABLE "PaymentRequest" ADD CONSTRAINT "PaymentRequest_values_check"
  CHECK ("amount" > 0 AND "status" IN ('DRAFT','SUBMITTED','APPROVED','REJECTED','PAID'));
ALTER TABLE "BankReconciliation" ADD CONSTRAINT "BankReconciliation_status_check" CHECK ("status" IN ('DRAFT','COMPLETED'));
ALTER TABLE "BankStatementLine" ADD CONSTRAINT "BankStatementLine_amount_check" CHECK ("amount" <> 0);
ALTER TABLE "AccountingMapping" ADD CONSTRAINT "AccountingMapping_kind_check" CHECK ("kind" IN ('ITEM','CUSTOMER','SUPPLIER','ACCOUNT','POSTING_ROLE'));
ALTER TABLE "DeviceAsset" ADD CONSTRAINT "DeviceAsset_interval_check" CHECK ("intervalMonths" BETWEEN 1 AND 120);
ALTER TABLE "ServiceVisit" ADD CONSTRAINT "ServiceVisit_values_check"
  CHECK ("type" IN ('PM','REPAIR') AND "status" IN ('SCHEDULED','IN_PROGRESS','COMPLETED','CANCELLED') AND "cost" >= 0);

CREATE FUNCTION phase3_reject_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Phase 3 audit and posted ledger history cannot be updated or deleted' USING ERRCODE = '23514';
END;
$$;

CREATE TRIGGER "ErpAuditLog_append_only"
  BEFORE UPDATE OR DELETE OR TRUNCATE ON "ErpAuditLog"
  FOR EACH STATEMENT EXECUTE FUNCTION phase3_reject_history_mutation();
CREATE TRIGGER "AccountingJournal_immutable"
  BEFORE UPDATE OR DELETE OR TRUNCATE ON "AccountingJournal"
  FOR EACH STATEMENT EXECUTE FUNCTION phase3_reject_history_mutation();
CREATE TRIGGER "LedgerEntry_immutable"
  BEFORE UPDATE OR DELETE OR TRUNCATE ON "LedgerEntry"
  FOR EACH STATEMENT EXECUTE FUNCTION phase3_reject_history_mutation();

-- Deferred until commit, so nested journal/entry inserts are validated together.
CREATE FUNCTION phase3_validate_journal() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  target_id text;
  debit_total numeric;
  credit_total numeric;
  entry_count integer;
BEGIN
  IF TG_TABLE_NAME = 'AccountingJournal' THEN target_id := NEW."id";
  ELSE target_id := NEW."journalId";
  END IF;
  SELECT count(*), coalesce(sum("debit"),0), coalesce(sum("credit"),0)
    INTO entry_count, debit_total, credit_total FROM "LedgerEntry" WHERE "journalId" = target_id;
  IF entry_count < 2 OR debit_total <= 0 OR debit_total <> credit_total THEN
    RAISE EXCEPTION 'Posted journal entries must balance exactly' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (SELECT 1 FROM "LedgerEntry" e JOIN "LedgerAccount" a ON a."id" = e."accountId"
    JOIN "AccountingJournal" j ON j."id" = e."journalId"
    WHERE e."journalId" = target_id AND a."company" <> j."company") THEN
    RAISE EXCEPTION 'Journal account must belong to the same workspace' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER "AccountingJournal_balanced"
  AFTER INSERT ON "AccountingJournal" DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION phase3_validate_journal();
CREATE CONSTRAINT TRIGGER "LedgerEntry_balanced"
  AFTER INSERT ON "LedgerEntry" DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION phase3_validate_journal();


-- Reporting and company navigation controls retained from the reviewed migrations.
ALTER TABLE "CashAccountSetting" ADD CONSTRAINT "CashAccountSetting_version_check" CHECK (version > 0);
ALTER TABLE "CashFlowClassification" ADD CONSTRAINT "CashFlowClassification_version_check" CHECK (version > 0);
ALTER TABLE "CashFlowClassification" ADD CONSTRAINT "CashFlowClassification_sign_check" CHECK ((operating >= 0 AND investing >= 0 AND financing >= 0 AND transfer >= 0) OR (operating <= 0 AND investing <= 0 AND financing <= 0 AND transfer <= 0));
ALTER TABLE "CompanyNavigation" ADD CONSTRAINT "CompanyNavigation_version_check" CHECK (version > 0);
ALTER TABLE "CompanyNavigation" ADD CONSTRAINT "CompanyNavigation_groups_check" CHECK (jsonb_typeof(groups) = 'array');

CREATE FUNCTION phase3_validate_cash_classification() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE entry_amount NUMERIC;
BEGIN
  SELECT debit-credit INTO STRICT entry_amount FROM "LedgerEntry" WHERE id=NEW."ledgerEntryId" AND "accountId"=NEW."accountId";
  IF NEW.operating+NEW.investing+NEW.financing+NEW.transfer <> entry_amount THEN
    RAISE EXCEPTION 'Cash classifications must exactly equal the posted entry amount' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "CashFlowClassification_amount_check" BEFORE INSERT ON "CashFlowClassification"
  FOR EACH ROW EXECUTE FUNCTION phase3_validate_cash_classification();
CREATE TRIGGER "CashFlowClassification_append_only" BEFORE UPDATE OR DELETE OR TRUNCATE ON "CashFlowClassification"
  FOR EACH STATEMENT EXECUTE FUNCTION phase3_reject_history_mutation();
CREATE TRIGGER "CashAccountSetting_append_only" BEFORE UPDATE OR DELETE OR TRUNCATE ON "CashAccountSetting"
  FOR EACH STATEMENT EXECUTE FUNCTION phase3_reject_history_mutation();

COMMIT;
