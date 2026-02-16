function toType(docKind) {
  const kind = String(docKind ?? '').toUpperCase();
  if (kind === 'PO') return 'purchase_order';
  if (kind === 'INV') return 'invoice';
  if (kind === 'ASN') return 'shipment_notice';
  return 'unknown';
}

function toMoney(total, currency) {
  const amount = Number(total);
  if (Number.isNaN(amount)) return undefined;
  return {
    amount,
    currency: String(currency ?? 'USD')
  };
}

function mapLineItems(rawItems) {
  if (!Array.isArray(rawItems)) return [];

  return rawItems.map((item, index) => {
    const row = item ?? {};
    const quantity = Number(row.qty);
    const unitPrice = Number(row.unit_price);
    const total = Number(row.ext_price);

    return {
      lineNumber: String(row.line_no ?? index + 1),
      sku: row.item_code ? String(row.item_code) : undefined,
      description: row.description ? String(row.description) : undefined,
      quantity: Number.isNaN(quantity) ? undefined : quantity,
      unitPrice: Number.isNaN(unitPrice) ? undefined : unitPrice,
      total: Number.isNaN(total) ? undefined : total
    };
  });
}

export const acmeEdiAdapter = {
  id: 'acme_edi',
  name: 'Acme EDI Product Adapter',
  normalizeDocument(document) {
    if (!document || typeof document !== 'object') {
      throw new Error('acme_edi adapter expects object document input');
    }

    const raw = document;
    const references = [];

    if (raw.po_number) {
      references.push({ type: 'po_number', value: String(raw.po_number) });
    }
    if (raw.invoice_number) {
      references.push({ type: 'invoice_number', value: String(raw.invoice_number) });
    }
    if (raw.asn_number) {
      references.push({ type: 'asn_number', value: String(raw.asn_number) });
    }

    return {
      id: String(raw.doc_id ?? crypto.randomUUID()),
      type: toType(raw.doc_kind),
      documentNumber: String(raw.doc_number ?? raw.doc_id ?? 'UNKNOWN'),
      issueDate: raw.doc_date ? String(raw.doc_date) : undefined,
      partnerName: raw.trading_partner ? String(raw.trading_partner) : undefined,
      buyer: raw.buyer_name ? { name: String(raw.buyer_name), role: 'buyer' } : undefined,
      seller: raw.seller_name ? { name: String(raw.seller_name), role: 'seller' } : undefined,
      totalAmount: toMoney(raw.total, raw.currency),
      lineItems: mapLineItems(raw.lines),
      references,
      sourceTrace: {
        adapter: 'acme_edi',
        nativeType: raw.doc_kind ? String(raw.doc_kind) : undefined,
        rawReference: raw.doc_id ? String(raw.doc_id) : undefined
      },
      extensions: {
        originalPayload: raw
      }
    };
  }
};

