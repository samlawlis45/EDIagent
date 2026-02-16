function normalizeType(value) {
  if (value === 'purchase_order' || value === 'invoice' || value === 'shipment_notice') {
    return value;
  }
  return 'unknown';
}

export const canonicalAdapter = {
  id: 'canonical',
  name: 'Canonical JSON Adapter',
  normalizeDocument(document) {
    if (!document || typeof document !== 'object') {
      throw new Error('canonical adapter expects object document input');
    }

    const raw = document;

    return {
      id: String(raw.id ?? crypto.randomUUID()),
      type: normalizeType(raw.type),
      documentNumber: String(raw.documentNumber ?? raw.id ?? 'UNKNOWN'),
      issueDate: raw.issueDate ? String(raw.issueDate) : undefined,
      partnerName: raw.partnerName ? String(raw.partnerName) : undefined,
      buyer: raw.buyer ?? undefined,
      seller: raw.seller ?? undefined,
      shipTo: raw.shipTo ?? undefined,
      billTo: raw.billTo ?? undefined,
      totalAmount: raw.totalAmount ?? undefined,
      lineItems: Array.isArray(raw.lineItems) ? raw.lineItems : [],
      references: Array.isArray(raw.references) ? raw.references : [],
      sourceTrace: {
        adapter: 'canonical',
        nativeType: raw.type ? String(raw.type) : undefined
      },
      extensions: raw.extensions ?? {}
    };
  }
};

