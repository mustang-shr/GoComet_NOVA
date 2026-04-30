export const SAMPLES = {
  bl: `BILL OF LADING

BL Number: MSCM-2026-78432
Date: 2026-04-28
Port of Loading: Shanghai, China
Port of Discharge: Hamburg, Germany

Shipper:
Guangzhou Electronics Co. Ltd
456 Zhongshan Road
Guangzhou, China

Consignee:
Tech Import GmbH
789 Frankfurter Strasse
Frankfurt, Germany

Vessel: MSC Mediterranean
Voyage: 2026-L04
Container: 4 x 40ft HC

Commodity Description: Electronic Components
HS Code: 8542.31
Gross Weight: 18,500 kg
Net Weight: 17,200 kg
Total Value: USD 124,500

Incoterms: CIF Hamburg
Terms: Prepaid

Notes: Standard containerized shipment. All documents in order.`,

  invoice: `COMMERCIAL INVOICE

Invoice Number: INV-2026-05640
Date: 2026-04-27
Currency: USD

SOLD BY:
Shanghai Trading Ltd
Shanghai, China

SOLD TO:
European Distributors Ltd
Amsterdam, Netherlands

Description of Goods:
- 500 pcs Industrial Control Modules @ $180 = $90,000
- 200 pcs Power Supply Units @ $172.50 = $34,500

Subtotal: $124,500
Shipping: Included
Insurance: Included
Total Invoice Value: $124,500

Payment Terms: Net 30 days
Incoterms: CIF

Certifications: CE Mark, RoHS Compliant`,

  risky: `MANIFEST - FLAGGED FOR REVIEW

Shipment ID: RISKY-2026-8873
Origin: Unknown Port, Vietnam
Destination: Customs Warehouse, Los Angeles

Shipper: Not Clearly Identified
Consignee: Multiple Recipients (Names Withheld)

Contents: Electronic Equipment (Unspecified)
Declared Value: USD 2,500,000
Actual Customs Classification: Uncertain

Red Flags:
- No clear bill of lading
- Shipper address appears fraudulent
- Multiple consignee entries
- Undeclared weight discrepancy (claimed 500kg, actual 2,500kg)
- Missing end-use certificates
- Previous shipper flagged for sanctions violations
- Routing through high-risk jurisdiction

Documents: Incomplete / Inconsistent
Previous Inspections: 3 violations in past 12 months`,

  customs: `CUSTOMS DECLARATION FORM

Reference: CD-2026-456789
Date Filed: 2026-04-28

Exporter: Shanghai Electronics Export
Importer: Hamburg Import Services

Origin Country: China
Destination: Germany

Product: Electronic Components
HS Classification: 8542.31.00
Quantity: 500 units
Unit Price: $249
Total Value: $124,500

Weight: 18.5 MT (gross), 17.2 MT (net)
Packaging: 4 x 40ft containers

Certificates:
- Certificate of Origin ✓
- Phytosanitary Certificate: N/A
- Health Certificate: N/A
- Quality Certification ✓

Duties & Taxes Status: Pre-calculated
Expected Duties: USD 12,450 (10%)
VAT: EUR 23,655 (19%)

Special Conditions: Standard processing expected`
}
