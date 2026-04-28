import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { CompanyCandidate, CompanyLead, ScraperInput } from "../types.js";

export class LeadStore {
  private readonly db: DatabaseSync;

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        service TEXT NOT NULL,
        area TEXT NOT NULL,
        input_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS candidates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id INTEGER NOT NULL,
        company_name TEXT NOT NULL,
        source TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY(run_id) REFERENCES runs(id)
      );

      CREATE TABLE IF NOT EXISTS leads (
        id TEXT PRIMARY KEY,
        run_id INTEGER NOT NULL,
        company_name TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY(run_id) REFERENCES runs(id)
      );
    `);
  }

  createRun(input: ScraperInput): number {
    const result = this.db
      .prepare("INSERT INTO runs (service, area, input_json, created_at) VALUES (?, ?, ?, ?)")
      .run(input.service, input.area, JSON.stringify(input), new Date().toISOString());

    return Number(result.lastInsertRowid);
  }

  saveCandidates(runId: number, candidates: CompanyCandidate[]): void {
    const insert = this.db.prepare(
      "INSERT INTO candidates (run_id, company_name, source, payload_json, created_at) VALUES (?, ?, ?, ?, ?)",
    );

    this.db.exec("BEGIN");
    try {
      for (const candidate of candidates) {
        insert.run(
          runId,
          candidate.companyName,
          candidate.source,
          JSON.stringify(candidate),
          new Date().toISOString(),
        );
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  saveLeads(runId: number, leads: CompanyLead[]): void {
    const insert = this.db.prepare(
      "INSERT OR REPLACE INTO leads (id, run_id, company_name, payload_json, created_at) VALUES (?, ?, ?, ?, ?)",
    );

    this.db.exec("BEGIN");
    try {
      for (const lead of leads) {
        insert.run(lead.id, runId, lead.companyName, JSON.stringify(lead), new Date().toISOString());
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  close(): void {
    this.db.close();
  }
}
