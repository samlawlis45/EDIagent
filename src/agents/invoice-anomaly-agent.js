function safePercentDifference(base, actual) {
  if (base === 0) return actual === 0 ? 0 : 100;
  return Math.abs(((actual - base) / base) * 100);
}

function addFinding(findings, code, severity, message, details) {
  findings.push({ code, severity, message, details });
}

function compareTotals(findings, invoice, po, tolerance) {
  if (!invoice.totalAmount || !po?.totalAmount) return;

  const pct = safePercentDifference(po.totalAmount.amount, invoice.totalAmount.amount);
  if (pct > tolerance.amountPercent) {
    addFinding(
      findings,
      'INVOICE_TOTAL_MISMATCH',
      'critical',
      `Invoice total differs from PO total by ${pct.toFixed(2)}%`,
      {
        poTotal: po.totalAmount.amount,
        invoiceTotal: invoice.totalAmount.amount,
        tolerancePercent: tolerance.amountPercent
      }
    );
  }
}

function compareLineQuantities(findings, invoice, po, tolerance) {
  if (!po) return;

  const poBySku = new Map(
    po.lineItems
      .filter((line) => line.sku && line.quantity !== undefined)
      .map((line) => [line.sku, line])
  );

  for (const invLine of invoice.lineItems) {
    if (!invLine.sku || invLine.quantity === undefined) continue;
    const poLine = poBySku.get(invLine.sku);

    if (!poLine) {
      addFinding(findings, 'INVOICE_LINE_NOT_IN_PO', 'warning', `Invoice line SKU ${invLine.sku} not found in PO`);
      continue;
    }

    if (poLine.quantity === undefined) continue;
    const qtyPct = safePercentDifference(poLine.quantity, invLine.quantity);
    if (qtyPct > tolerance.quantityPercent) {
      addFinding(findings, 'INVOICE_QTY_MISMATCH', 'critical', `Invoice quantity mismatch for SKU ${invLine.sku}`, {
        poQuantity: poLine.quantity,
        invoiceQuantity: invLine.quantity,
        tolerancePercent: tolerance.quantityPercent
      });
    }
  }
}

function comparePoReference(findings, invoice, po) {
  if (!po) return;
  const invoicePoRef = invoice.references.find((ref) => ref.type === 'po_number')?.value;

  if (!invoicePoRef) {
    addFinding(findings, 'MISSING_PO_REFERENCE', 'warning', 'Invoice is missing PO reference');
    return;
  }

  if (invoicePoRef !== po.documentNumber) {
    addFinding(findings, 'PO_REFERENCE_MISMATCH', 'critical', 'Invoice PO reference does not match provided PO document number', {
      invoicePoReference: invoicePoRef,
      poDocumentNumber: po.documentNumber
    });
  }
}

function compareShipmentNotice(findings, invoice, asn) {
  if (!asn) return;

  const asnLines = new Set(asn.lineItems.map((line) => line.sku).filter(Boolean));
  const invoiceSkus = invoice.lineItems.map((line) => line.sku).filter(Boolean);

  for (const sku of invoiceSkus) {
    if (!asnLines.has(sku)) {
      addFinding(findings, 'INVOICE_SKU_NOT_SHIPPED', 'warning', `Invoice SKU ${sku} not present on shipment notice`);
    }
  }
}

export function runInvoiceAnomalyAgent(invoice, purchaseOrder, shipmentNotice, tolerance) {
  const resolvedTolerance = {
    amountPercent: tolerance?.amountPercent ?? 2,
    quantityPercent: tolerance?.quantityPercent ?? 1
  };

  const findings = [];

  if (invoice.type !== 'invoice') {
    addFinding(findings, 'INVALID_PRIMARY_DOC', 'critical', 'Primary document must be an invoice');
  }

  compareTotals(findings, invoice, purchaseOrder, resolvedTolerance);
  compareLineQuantities(findings, invoice, purchaseOrder, resolvedTolerance);
  comparePoReference(findings, invoice, purchaseOrder);
  compareShipmentNotice(findings, invoice, shipmentNotice);

  return {
    status: findings.length ? 'review_required' : 'ok',
    invoiceNumber: invoice.documentNumber,
    findingCount: findings.length,
    findings
  };
}

