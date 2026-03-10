import { useState, useRef, useCallback, useEffect } from "react";

const EXTRACTION_PROMPT = `You are a world-class document analyst. You will receive the raw text extracted from a PDF document (clinical trial report, pitch deck, financial filing, or similar).

Your job: extract structured insights and return ONLY valid JSON (no markdown, no backticks, no preamble). The JSON must follow this exact schema:

{
  "document_type": "clinical_trial | pitch_deck | financial_report | research_paper | other",
  "title": "best guess at the document title",
  "executive_summary": "A 3-5 sentence high-level summary of the document's purpose and key conclusions. Write crisply like a McKinsey analyst.",
  "key_metrics": [
    {
      "label": "metric name (e.g. 'Primary Endpoint p-value', 'ARR', 'Total Funding')",
      "value": "the value as stated",
      "context": "one sentence of context or significance"
    }
  ],
  "critical_findings": [
    "Finding 1 — short, punchy, insight-dense sentence",
    "Finding 2",
    "Finding 3"
  ],
  "risks_and_limitations": [
    "Risk or limitation 1",
    "Risk or limitation 2"
  ],
  "one_page_summary": "A ~250 word structured summary suitable for a one-pager. Use clear paragraph breaks. Cover: what the document is, key results/metrics, implications, and what to watch next."
}

Rules:
- Extract EVERY quantitative metric you can find (financial figures, p-values, percentages, sample sizes, timelines, valuations, growth rates).
- If data is ambiguous or missing, say so explicitly in the value field.
- Be opinionated in the summary — state what matters and why.
- Write for a sophisticated reader (PM, investor, or analyst).
- Return ONLY the JSON object. No other text.`;

// PDF.js text extraction via CDN
async function extractTextFromPDF(file) {
  const pdfjsLib = await loadPDFJS();
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let fullText = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map((item) => item.str).join(" ");
    fullText += `\n--- Page ${i} ---\n${pageText}`;
  }
  return { text: fullText, pageCount: pdf.numPages };
}

let pdfjsLoaded = null;
function loadPDFJS() {
  if (pdfjsLoaded) return pdfjsLoaded;
  pdfjsLoaded = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    script.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
      resolve(window.pdfjsLib);
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });
  return pdfjsLoaded;
}

// Analyze with Claude API
async function analyzeWithClaude(text) {
  const trimmed = text.slice(0, 80000);
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4000,
      messages: [
        {
          role: "user",
          content: `${EXTRACTION_PROMPT}\n\n--- DOCUMENT TEXT ---\n${trimmed}`,
        },
      ],
    }),
  });
  const data = await response.json();
  const raw = data.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");
  return JSON.parse(raw.replace(/```json|```/g, "").trim());
}

// Status badge colors by doc type
const DOC_TYPE_STYLES = {
  clinical_trial: { bg: "#E8F5E9", text: "#2E7D32", label: "Clinical Trial" },
  pitch_deck: { bg: "#E3F2FD", text: "#1565C0", label: "Pitch Deck" },
  financial_report: { bg: "#FFF3E0", text: "#E65100", label: "Financial Report" },
  research_paper: { bg: "#F3E5F5", text: "#6A1B9A", label: "Research Paper" },
  other: { bg: "#ECEFF1", text: "#37474F", label: "Document" },
};

// Generate downloadable PDF summary using the browser
function generatePDFDownload(insights) {
  // Build an HTML document for printing to PDF
  const metrics = insights.key_metrics
    .map(
      (m) =>
        `<div style="background:#f8f9fa;padding:14px 18px;border-radius:8px;border-left:4px solid #1a1a2e;margin-bottom:10px;">
          <div style="font-weight:700;font-size:13px;color:#1a1a2e;text-transform:uppercase;letter-spacing:0.5px;">${m.label}</div>
          <div style="font-size:22px;font-weight:800;color:#0d0d1a;margin:4px 0;">${m.value}</div>
          <div style="font-size:12px;color:#666;">${m.context}</div>
        </div>`
    )
    .join("");

  const findings = insights.critical_findings
    .map(
      (f, i) =>
        `<div style="display:flex;gap:10px;margin-bottom:8px;"><span style="font-weight:800;color:#1a1a2e;min-width:20px;">${i + 1}.</span><span style="color:#333;">${f}</span></div>`
    )
    .join("");

  const docStyle = DOC_TYPE_STYLES[insights.document_type] || DOC_TYPE_STYLES.other;

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${insights.title} — Insight Extract</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700;800&display=swap');
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:'IBM Plex Sans',sans-serif; padding:40px; color:#1a1a1a; max-width:800px; margin:0 auto; }
    .badge { display:inline-block; padding:4px 12px; border-radius:20px; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.8px; background:${docStyle.bg}; color:${docStyle.text}; }
    h1 { font-size:26px; font-weight:800; margin:16px 0 8px; line-height:1.2; }
    .summary { font-size:15px; line-height:1.7; color:#444; margin:16px 0 28px; padding:16px 20px; background:#fafafa; border-radius:8px; border:1px solid #eee; }
    h2 { font-size:14px; text-transform:uppercase; letter-spacing:1.2px; color:#888; font-weight:700; margin:28px 0 14px; }
    .one-pager { font-size:14px; line-height:1.8; color:#333; white-space:pre-wrap; }
    .footer { margin-top:40px; padding-top:16px; border-top:1px solid #eee; font-size:11px; color:#aaa; text-align:center; }
  </style></head><body>
    <div class="badge">${docStyle.label}</div>
    <h1>${insights.title}</h1>
    <div class="summary">${insights.executive_summary}</div>
    <h2>Key Metrics</h2>
    ${metrics}
    <h2>Critical Findings</h2>
    ${findings}
    <h2>One-Page Summary</h2>
    <div class="one-pager">${insights.one_page_summary}</div>
    <div class="footer">Generated by PDF Insight Extractor · Powered by Claude</div>
  </body></html>`;

  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const printWindow = window.open(url, "_blank");
  if (printWindow) {
    printWindow.onload = () => {
      setTimeout(() => printWindow.print(), 500);
    };
  }
}

// Animated counter
function AnimatedNumber({ value }) {
  const numericParts = value.match(/[\d,.]+/g);
  if (!numericParts) return <span>{value}</span>;
  return <span style={{ fontVariantNumeric: "tabular-nums" }}>{value}</span>;
}

// ─── MAIN APP ────────────────────────────────────────────
export default function PDFInsightExtractor() {
  const [stage, setStage] = useState("upload"); // upload | extracting | analyzing | done | error
  const [file, setFile] = useState(null);
  const [insights, setInsights] = useState(null);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState("");
  const [pageCount, setPageCount] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);
  const [expandedMetric, setExpandedMetric] = useState(null);

  const processFile = useCallback(async (selectedFile) => {
    if (!selectedFile || selectedFile.type !== "application/pdf") {
      setError("Please upload a PDF file.");
      setStage("error");
      return;
    }
    setFile(selectedFile);
    setStage("extracting");
    setProgress("Parsing PDF pages...");

    try {
      const { text, pageCount: pages } = await extractTextFromPDF(selectedFile);
      setPageCount(pages);

      if (text.trim().length < 100) {
        setError(
          "Could not extract enough text from this PDF. It may be image-based (scanned). Try a text-based PDF."
        );
        setStage("error");
        return;
      }

      setStage("analyzing");
      setProgress("Claude is extracting structured insights...");

      const result = await analyzeWithClaude(text);
      setInsights(result);
      setStage("done");
    } catch (err) {
      console.error(err);
      setError(`Analysis failed: ${err.message}`);
      setStage("error");
    }
  }, []);

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      setDragOver(false);
      const droppedFile = e.dataTransfer.files?.[0];
      if (droppedFile) processFile(droppedFile);
    },
    [processFile]
  );

  const reset = () => {
    setStage("upload");
    setFile(null);
    setInsights(null);
    setError("");
    setProgress("");
    setExpandedMetric(null);
  };

  // ─── STYLES ──────────────────────────────────────────────
  const styles = {
    app: {
      minHeight: "100vh",
      background: "#0a0a0f",
      color: "#e8e8ed",
      fontFamily: "'IBM Plex Sans', -apple-system, sans-serif",
      overflow: "hidden",
    },
    header: {
      padding: "32px 40px 0",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
    },
    logo: {
      display: "flex",
      alignItems: "center",
      gap: "12px",
    },
    logoIcon: {
      width: 36,
      height: 36,
      borderRadius: "10px",
      background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: "16px",
      fontWeight: 800,
      color: "#fff",
    },
    logoText: {
      fontSize: "15px",
      fontWeight: 700,
      letterSpacing: "-0.3px",
      color: "#e8e8ed",
    },
    logoSub: {
      fontSize: "11px",
      color: "#666",
      fontWeight: 500,
      letterSpacing: "0.5px",
      textTransform: "uppercase",
    },
    main: {
      maxWidth: 960,
      margin: "0 auto",
      padding: "40px",
    },
    dropzone: {
      border: dragOver ? "2px solid #6366f1" : "2px dashed #2a2a3a",
      borderRadius: "16px",
      padding: "80px 40px",
      textAlign: "center",
      cursor: "pointer",
      transition: "all 0.3s ease",
      background: dragOver ? "rgba(99,102,241,0.05)" : "rgba(255,255,255,0.01)",
      marginTop: "60px",
    },
    dropIcon: {
      width: 72,
      height: 72,
      borderRadius: "50%",
      background: "linear-gradient(135deg, rgba(99,102,241,0.15), rgba(139,92,246,0.1))",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      margin: "0 auto 24px",
      fontSize: "28px",
    },
    dropTitle: {
      fontSize: "20px",
      fontWeight: 700,
      marginBottom: "8px",
      color: "#e8e8ed",
    },
    dropHint: {
      fontSize: "14px",
      color: "#666",
      lineHeight: 1.6,
    },
    processingContainer: {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      marginTop: "120px",
      gap: "24px",
    },
    spinner: {
      width: 56,
      height: 56,
      border: "3px solid #1a1a2e",
      borderTop: "3px solid #6366f1",
      borderRadius: "50%",
      animation: "spin 0.8s linear infinite",
    },
    resultsHeader: {
      display: "flex",
      alignItems: "flex-start",
      justifyContent: "space-between",
      marginBottom: "32px",
      flexWrap: "wrap",
      gap: "16px",
    },
    badge: (bg, color) => ({
      display: "inline-block",
      padding: "5px 14px",
      borderRadius: "20px",
      fontSize: "11px",
      fontWeight: 700,
      textTransform: "uppercase",
      letterSpacing: "0.8px",
      background: bg,
      color: color,
    }),
    title: {
      fontSize: "28px",
      fontWeight: 800,
      letterSpacing: "-0.5px",
      color: "#f0f0f5",
      lineHeight: 1.2,
      marginTop: "8px",
    },
    sectionLabel: {
      fontSize: "11px",
      textTransform: "uppercase",
      letterSpacing: "1.5px",
      color: "#555",
      fontWeight: 700,
      marginBottom: "14px",
    },
    summaryBox: {
      background: "rgba(255,255,255,0.03)",
      border: "1px solid #1e1e2e",
      borderRadius: "12px",
      padding: "24px",
      fontSize: "15px",
      lineHeight: 1.8,
      color: "#b0b0c0",
      marginBottom: "36px",
    },
    metricsGrid: {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
      gap: "12px",
      marginBottom: "36px",
    },
    metricCard: (isExpanded) => ({
      background: isExpanded ? "rgba(99,102,241,0.08)" : "rgba(255,255,255,0.02)",
      border: isExpanded ? "1px solid rgba(99,102,241,0.3)" : "1px solid #1a1a2a",
      borderRadius: "12px",
      padding: "20px",
      cursor: "pointer",
      transition: "all 0.2s ease",
    }),
    metricLabel: {
      fontSize: "11px",
      textTransform: "uppercase",
      letterSpacing: "0.8px",
      color: "#6366f1",
      fontWeight: 700,
      marginBottom: "6px",
    },
    metricValue: {
      fontSize: "24px",
      fontWeight: 800,
      color: "#f0f0f5",
      letterSpacing: "-0.5px",
    },
    metricContext: {
      fontSize: "12px",
      color: "#777",
      marginTop: "8px",
      lineHeight: 1.5,
    },
    findingRow: {
      display: "flex",
      gap: "14px",
      padding: "14px 0",
      borderBottom: "1px solid #141420",
    },
    findingNum: {
      fontSize: "13px",
      fontWeight: 800,
      color: "#6366f1",
      minWidth: "24px",
      paddingTop: "2px",
    },
    findingText: {
      fontSize: "14px",
      lineHeight: 1.7,
      color: "#b0b0c0",
    },
    onePager: {
      background: "rgba(255,255,255,0.02)",
      border: "1px solid #1e1e2e",
      borderRadius: "12px",
      padding: "28px",
      fontSize: "14px",
      lineHeight: 1.9,
      color: "#999",
      whiteSpace: "pre-wrap",
      marginBottom: "36px",
    },
    btnPrimary: {
      padding: "12px 24px",
      background: "linear-gradient(135deg, #6366f1, #7c3aed)",
      color: "#fff",
      border: "none",
      borderRadius: "10px",
      fontSize: "13px",
      fontWeight: 700,
      cursor: "pointer",
      letterSpacing: "0.3px",
    },
    btnSecondary: {
      padding: "12px 24px",
      background: "transparent",
      color: "#888",
      border: "1px solid #2a2a3a",
      borderRadius: "10px",
      fontSize: "13px",
      fontWeight: 600,
      cursor: "pointer",
    },
    actions: {
      display: "flex",
      gap: "12px",
      flexWrap: "wrap",
    },
    errorBox: {
      marginTop: "80px",
      textAlign: "center",
    },
    errorText: {
      color: "#ef4444",
      fontSize: "15px",
      marginBottom: "20px",
    },
    fileMeta: {
      display: "flex",
      gap: "16px",
      fontSize: "12px",
      color: "#555",
      marginTop: "6px",
    },
  };

  const docStyle =
    insights && DOC_TYPE_STYLES[insights.document_type]
      ? DOC_TYPE_STYLES[insights.document_type]
      : DOC_TYPE_STYLES.other;

  return (
    <div style={styles.app}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700;800&display=swap');
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
        .fade-in { animation: fadeIn 0.5s ease both; }
        .fade-in-d1 { animation: fadeIn 0.5s ease 0.1s both; }
        .fade-in-d2 { animation: fadeIn 0.5s ease 0.2s both; }
        .fade-in-d3 { animation: fadeIn 0.5s ease 0.3s both; }
        .fade-in-d4 { animation: fadeIn 0.5s ease 0.4s both; }
        .metric-card:hover { background: rgba(99,102,241,0.06) !important; border-color: rgba(99,102,241,0.2) !important; }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: #0a0a0f; }
        ::-webkit-scrollbar-thumb { background: #2a2a3a; border-radius: 3px; }
      `}</style>

      {/* HEADER */}
      <div style={styles.header}>
        <div style={styles.logo}>
          <div style={styles.logoIcon}>IX</div>
          <div>
            <div style={styles.logoText}>Insight Extractor</div>
            <div style={styles.logoSub}>AI-Powered Document Analysis</div>
          </div>
        </div>
        {stage === "done" && (
          <button style={styles.btnSecondary} onClick={reset}>
            ← New Document
          </button>
        )}
      </div>

      <div style={styles.main}>
        {/* ─── UPLOAD ─── */}
        {stage === "upload" && (
          <div
            className="fade-in"
            style={styles.dropzone}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <div style={styles.dropIcon}>📄</div>
            <div style={styles.dropTitle}>
              Drop your PDF here, or click to browse
            </div>
            <div style={styles.dropHint}>
              Clinical trial reports · Pitch decks · Financial filings · Research papers
              <br />
              Claude will extract structured insights, key metrics, and a one-page summary.
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              style={{ display: "none" }}
              onChange={(e) => processFile(e.target.files?.[0])}
            />
          </div>
        )}

        {/* ─── PROCESSING ─── */}
        {(stage === "extracting" || stage === "analyzing") && (
          <div style={styles.processingContainer} className="fade-in">
            <div style={styles.spinner} />
            <div style={{ fontSize: "16px", fontWeight: 600, color: "#e8e8ed" }}>
              {stage === "extracting" ? "Extracting text from PDF..." : "Analyzing with Claude..."}
            </div>
            <div style={{ fontSize: "13px", color: "#555" }}>{progress}</div>
            {file && (
              <div style={{ fontSize: "12px", color: "#444", marginTop: "8px" }}>
                {file.name} · {(file.size / 1024).toFixed(0)} KB
                {pageCount > 0 && ` · ${pageCount} pages`}
              </div>
            )}
          </div>
        )}

        {/* ─── ERROR ─── */}
        {stage === "error" && (
          <div style={styles.errorBox} className="fade-in">
            <div style={{ fontSize: "48px", marginBottom: "16px" }}>⚠️</div>
            <div style={styles.errorText}>{error}</div>
            <button style={styles.btnPrimary} onClick={reset}>
              Try Again
            </button>
          </div>
        )}

        {/* ─── RESULTS ─── */}
        {stage === "done" && insights && (
          <div>
            {/* Header */}
            <div style={styles.resultsHeader} className="fade-in">
              <div>
                <span style={styles.badge(docStyle.bg, docStyle.text)}>
                  {docStyle.label}
                </span>
                <h1 style={styles.title}>{insights.title}</h1>
                <div style={styles.fileMeta}>
                  <span>{file?.name}</span>
                  <span>·</span>
                  <span>{pageCount} pages</span>
                  <span>·</span>
                  <span>{insights.key_metrics?.length || 0} metrics extracted</span>
                </div>
              </div>
              <div style={styles.actions}>
                <button
                  style={styles.btnPrimary}
                  onClick={() => generatePDFDownload(insights)}
                >
                  ↓ Export PDF
                </button>
                <button
                  style={styles.btnSecondary}
                  onClick={() => {
                    navigator.clipboard.writeText(JSON.stringify(insights, null, 2));
                  }}
                >
                  Copy JSON
                </button>
              </div>
            </div>

            {/* Executive Summary */}
            <div className="fade-in-d1">
              <div style={styles.sectionLabel}>Executive Summary</div>
              <div style={styles.summaryBox}>{insights.executive_summary}</div>
            </div>

            {/* Key Metrics */}
            <div className="fade-in-d2">
              <div style={styles.sectionLabel}>
                Key Metrics ({insights.key_metrics?.length || 0})
              </div>
              <div style={styles.metricsGrid}>
                {insights.key_metrics?.map((m, i) => (
                  <div
                    key={i}
                    className="metric-card"
                    style={styles.metricCard(expandedMetric === i)}
                    onClick={() =>
                      setExpandedMetric(expandedMetric === i ? null : i)
                    }
                  >
                    <div style={styles.metricLabel}>{m.label}</div>
                    <div style={styles.metricValue}>
                      <AnimatedNumber value={m.value} />
                    </div>
                    {(expandedMetric === i || true) && (
                      <div style={styles.metricContext}>{m.context}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Critical Findings */}
            <div className="fade-in-d3">
              <div style={styles.sectionLabel}>Critical Findings</div>
              <div style={{ marginBottom: "36px" }}>
                {insights.critical_findings?.map((f, i) => (
                  <div key={i} style={styles.findingRow}>
                    <div style={styles.findingNum}>
                      {String(i + 1).padStart(2, "0")}
                    </div>
                    <div style={styles.findingText}>{f}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Risks */}
            {insights.risks_and_limitations?.length > 0 && (
              <div className="fade-in-d3">
                <div style={styles.sectionLabel}>Risks & Limitations</div>
                <div style={{ marginBottom: "36px" }}>
                  {insights.risks_and_limitations?.map((r, i) => (
                    <div key={i} style={styles.findingRow}>
                      <div style={{ ...styles.findingNum, color: "#ef4444" }}>⚠</div>
                      <div style={styles.findingText}>{r}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* One-page Summary */}
            <div className="fade-in-d4">
              <div style={styles.sectionLabel}>One-Page Summary</div>
              <div style={styles.onePager}>{insights.one_page_summary}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
