/**
 * REAL DATA — ORCA demo source rows.
 *
 * Verbatim copy of `artifacts/demo/demo_shipments.csv` from the current ORCA
 * backend export. These are REAL source rows, not fixtures: values are never
 * altered, only parsed.
 *
 * Feature-map construction mirrors the backend dashboard helper
 * `api_client.row_to_features()`:
 *   - drop ID, T_pred, Delay_Days, Delay_Flag (identifier / outcome columns)
 *   - omit null or blank values
 *   - preserve numbers as numbers and strings as strings
 *
 * Framework-agnostic: plain TypeScript, no framework imports.
 */

export const NON_FEATURE_COLUMNS = ["ID", "T_pred", "Delay_Days", "Delay_Flag"] as const;

/** Provenance vocabulary used across the compatibility adapter. */
export const PROVENANCE = {
  real: "REAL DATA",
  model: "MODEL OUTPUT",
  synthetic: "SYNTHETIC DEMO OVERLAY",
  simulated: "SIMULATED SCENARIO",
} as const;

const DEMO_SHIPMENTS_CSV = `ID,T_pred,Delay_Flag,Delay_Days,Unit Price,vendor_hist_volume,country_hist_delay_rate,Country,T_pred_quarter,vendor_hist_delay_median,Brand,weight_is_numeric,Fulfill Via,freight_is_numeric,Molecule/Test Type,vendor_hist_delay_rate,Manufacturing Site,First Line Designation,is_rdc_fulfillment,po_sent_is_date,Dosage Form,Forecast_Horizon_Days,PQ_to_PO_Days,T_pred_year,T_pred_month,Dosage,Unit of Measure (Per Pack),Shipment Mode,pq_first_sent_is_date,site_hist_delay_rate,country_hist_delay_median,Line Item Value,Product Group,Pack Price,is_pre_pq_process,Line Item Insurance (USD),Sub Classification,Scheduled_Transit_Days,T_pred_dayofweek,country_hist_volume,Vendor INCO Term,Vendor,Line Item Quantity
62168,2015-05-11,0,0,0.3784364357202451,181.0,0.1081081081081081,South Africa,2,0.0,Generic,0,Direct Drop,0,Tenofovir Disoproxil Fumarate,0.0,Mylan (formerly Matrix) Nashik,No,0,1,Tablet,1,242.0,2015,5,300mg,30,Truck,1,0.1615755627009646,0.0,3.748326912757357,ARV,2.695977619867941,0,0.0392207131532812,Adult,1,0,1036.0,DDP,PHARMACY DIRECT,1.3862943611198906
38955,2015-05-12,0,0,0.9555114450274363,319.0,0.1644815256257449,Nigeria,2,0.0,Uni-Gold,1,Direct Drop,1,"HIV 1/2, Uni-Gold HIV Kit",0.0031347962382445,"Trinity Biotech, Plc",Yes,0,1,Test kit,31,8.0,2015,5,,20,Air,1,0.0030864197530864,-10.0,12.898021608514073,HRDT,3.49650756146648,0,6.155367518377918,HIV test,31,1,839.0,EXW,"Trinity Biotech, Plc",9.43236329562169
64208,2015-05-13,0,0,0.2776317365982795,230.0,0.0080645161290322,Vietnam,2,0.0,Generic,0,Direct Drop,0,Efavirenz/Lamivudine/Tenofovir Disoproxil Fumarate,0.0043478260869565,Hetero Unit III Hyderabad IN,No,0,1,Tablet - FDC,113,29.0,2015,5,600/300/300mg,30,Air,1,0.1573333333333333,0.0,11.779074864459474,ARV,2.3513752571634776,0,5.0407764510082425,Adult,113,2,620.0,EXW,HETERO LABS LIMITED,9.527848201325206
85601,2015-05-14,0,-6,0.0582689081239757,3595.0,0.08,South Sudan,2,-7.0,Generic,0,From RDC,0,Lamivudine/Nevirapine/Zidovudine,0.2433936022253129,"Strides, Bangalore, India.",No,1,0,Chewable/dispersible tablet - FDC,42,-1.0,2015,5,30/50/60mg,60,Air,1,0.1943231441048035,0.0,9.686363348546667,ARV,1.5260563034950494,0,2.9927277645336923,Pediatric,42,3,125.0,N/A - From RDC,SCMS from RDC,8.405591014834934
24151,2015-05-18,0,0,0.6523251860396903,0.0,0.1302521008403361,Haiti,2,0.0,Isentress,0,Direct Drop,0,Raltegravir,0.1418241786122034,"MSD, Haarlem, NL",Yes,0,1,Tablet,112,75.0,2015,5,400mg,60,Air,1,0.0256410256410256,0.0,10.007892611890918,ARV,4.034240638152395,0,3.3006401266708405,Adult,112,0,476.0,CIP,"MSD LATIN AMERICA SERVICES, S. DE R.L. DE C.V.",5.993961427306569
83349,2015-05-27,0,-12,0.1310282624064041,3629.0,0.0972972972972973,Rwanda,2,-8.0,Generic,0,From RDC,0,Lamivudine/Nevirapine/Zidovudine,0.2422154863598787,Hetero Unit III Hyderabad IN,Yes,1,0,Tablet - FDC,83,-1.0,2015,5,150/300/200mg,60,Air,1,0.156578947368421,0.0,9.392302697587676,ARV,2.209372711271867,0,2.716018370751387,Adult,83,2,370.0,N/A - From RDC,SCMS from RDC,7.299797366758161
28282,2015-05-29,0,0,0.0953101798043248,325.0,0.09375,Cameroon,2,0.0,Generic,1,Direct Drop,1,Lopinavir/Ritonavir,0.0123076923076923,ABBVIE Ludwigshafen Germany,Yes,0,1,Tablet,54,31.0,2015,5,100/25mg,60,Air,1,0.0808080808080808,0.0,10.864235264358811,ARV,1.937301774518713,0,4.135486505553276,Pediatric,54,4,64.0,FCA,ABBVIE LOGISTICS (FORMERLY ABBOTT LOGISTICS BV),9.082620630373812
76766,2015-06-16,0,0,0.5877866649021191,703.0,0.2304147465437788,Zambia,2,0.0,Determine,0,Direct Drop,0,"HIV 1/2, Determine Complete HIV Kit",0.1223328591749644,"Alere Medical Co., Ltd.",Yes,0,1,Test kit,51,54.0,2015,6,,100,Air,1,0.1464530892448512,0.0,10.65492722584759,HRDT,4.394449154672439,0,3.929862923556477,HIV test,51,1,434.0,EXW,"Orgenics, Ltd",6.274762021241939
15825,2015-06-25,0,0,0.9555114450274363,324.0,0.1564792176039119,Tanzania,2,0.0,Uni-Gold,0,Direct Drop,0,"HIV 1/2, Uni-Gold HIV Kit",0.0030864197530864,"Trinity Biotech, Plc",Yes,0,1,Test kit,60,17.0,2015,6,,20,Air,1,0.0030395136778115,0.0,9.45727857185611,HRDT,3.49650756146648,0,2.776954179749421,HIV test,60,3,409.0,EXW,"Trinity Biotech, Plc",5.993961427306569
86822,2015-07-01,0,-36,0.1043600153242427,3676.0,0.1790697674418604,Zimbabwe,3,-8.0,Generic,1,From RDC,0,Lamivudine/Zidovudine,0.2415669205658324,Mylan (formerly Matrix) Nashik,Yes,1,0,Tablet - FDC,70,-1.0,2015,7,150/300mg,60,Truck,1,0.1607565011820331,-1.0,11.64283731494644,ARV,2.017566137961748,0,4.905496975972951,Adult,70,2,430.0,N/A - From RDC,SCMS from RDC,9.768011412973678
61852,2015-07-17,0,0,0.6931471805599453,726.0,0.1132075471698113,Guyana,3,0.0,Determine,0,Direct Drop,0,"HIV 1/2, Determine Complete HIV Kit",0.1349862258953168,"Alere Medical Co., Ltd.",Yes,0,1,Test kit,42,23.0,2015,7,,100,Air,1,0.1652173913043478,0.0,10.32551474894327,HRDT,4.61512051684126,0,3.6082115510464816,HIV test,42,4,212.0,EXW,"Orgenics, Ltd",5.723585101952381
61436,2015-07-28,0,0,0.0953101798043248,91.0,0.1505376344086021,Uganda,3,0.0,Generic,0,Direct Drop,0,Efavirenz,0.0439560439560439,"Strides, Bangalore, India.",Yes,0,1,Tablet,31,22.0,2015,7,600mg,30,Air,1,0.1949152542372881,0.0,12.178273042489923,ARV,1.423108334242607,0,5.4378184053255945,Adult,31,1,651.0,EXW,STRIDES ARCOLAB LIMITED,11.030881642629687`;

export type FeatureValue = string | number;
export type FeatureMap = Record<string, FeatureValue>;

export interface OrcaSourceRow {
  /** Real `ID` column from the source export. */
  id: string;
  /** Raw column → verbatim string value (blank values omitted). */
  raw: Record<string, string>;
  /** Backend-ready feature map (row_to_features parity). */
  features: FeatureMap;
  country: string;
  manufacturing_site: string;
  vendor: string;
  shipment_mode: string;
  fulfill_via: string;
  line_item_value: number;
  scheduled_transit_days: number;
  sub_classification: string;
  product_group: string;
  t_pred: string;
}

/** Minimal RFC4180-ish CSV parser (quoted fields with embedded commas). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch !== "\r") field += ch;
  }
  row.push(field);
  if (row.length > 1 || row[0] !== "") rows.push(row);
  return rows;
}

const NUMERIC = /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/;

function coerce(value: string): FeatureValue {
  return NUMERIC.test(value) ? Number(value) : value;
}

/**
 * Mirrors the backend `row_to_features()` contract exactly.
 * Exported so scenario adapters can rebuild a feature map from a mutated row.
 */
export function rowToFeatures(raw: Record<string, string>): FeatureMap {
  const features: FeatureMap = {};
  for (const [key, value] of Object.entries(raw)) {
    if ((NON_FEATURE_COLUMNS as readonly string[]).includes(key)) continue;
    if (value === "" || value === null || value === undefined) continue;
    features[key] = coerce(value);
  }
  return features;
}

function buildRows(): OrcaSourceRow[] {
  const [header, ...lines] = parseCsv(DEMO_SHIPMENTS_CSV);
  if (!header) return [];

  return lines.map((cells) => {
    const raw: Record<string, string> = {};
    header.forEach((col, i) => {
      const value = (cells[i] ?? "").trim();
      if (value !== "") raw[col] = value;
    });
    const numberOf = (col: string) => Number(raw[col] ?? NaN);
    return {
      id: raw["ID"] ?? "",
      raw,
      features: rowToFeatures(raw),
      country: raw["Country"] ?? "Unknown",
      manufacturing_site: raw["Manufacturing Site"] ?? "Unknown site",
      vendor: raw["Vendor"] ?? "Unknown vendor",
      shipment_mode: raw["Shipment Mode"] ?? "Unknown",
      fulfill_via: raw["Fulfill Via"] ?? "Unknown",
      line_item_value: numberOf("Line Item Value"),
      scheduled_transit_days: numberOf("Scheduled_Transit_Days"),
      sub_classification: raw["Sub Classification"] ?? "",
      product_group: raw["Product Group"] ?? "",
      t_pred: raw["T_pred"] ?? "",
    } satisfies OrcaSourceRow;
  });
}

let cached: OrcaSourceRow[] | null = null;

/** Bundled REAL source rows from the current backend export. */
export function sourceRows(): OrcaSourceRow[] {
  cached ??= buildRows();
  return cached;
}

export function sourceRow(id: string): OrcaSourceRow | null {
  return sourceRows().find((r) => r.id === id) ?? null;
}

/* ------------------------------------------------------------------ */
/* Deterministic country centroids — SYNTHETIC DEMO OVERLAY            */
/* ------------------------------------------------------------------ */

/**
 * Geographic placement is NOT supplied by the backend. The country string is
 * REAL DATA; the map coordinate is an operational placement overlay.
 */
const COUNTRY_CENTROIDS: Record<string, [number, number]> = {
  "South Africa": [-30.5595, 22.9375],
  Nigeria: [9.082, 8.6753],
  Vietnam: [14.0583, 108.2772],
  "South Sudan": [6.877, 31.307],
  Haiti: [18.9712, -72.2852],
  Rwanda: [-1.9403, 29.8739],
  Cameroon: [7.3697, 12.3547],
  Zambia: [-13.1339, 27.8493],
  Tanzania: [-6.369, 34.8888],
  Zimbabwe: [-19.0154, 29.1549],
  Guyana: [4.8604, -58.9302],
  Uganda: [1.3733, 32.2903],
};

export function countryCentroid(country: string): [number, number] {
  const hit = COUNTRY_CENTROIDS[country];
  if (hit) return hit;
  // Deterministic fallback so unknown countries never jitter between renders.
  let h = 0;
  for (let i = 0; i < country.length; i++) h = (h * 31 + country.charCodeAt(i)) >>> 0;
  return [((h % 120) - 60) / 2, ((h >>> 7) % 340) - 170];
}
