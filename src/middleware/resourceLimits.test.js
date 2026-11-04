import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import { errors } from "celebrate";
import { createBoundedUploads } from "./boundedUploads.js";
import { list as categoryList } from "../validations/site/inventory/category/list.js";
import { list as productList } from "../validations/site/inventory/product/list.js";
import http from "node:http";
import { once } from "node:events";

describe("resource limits", () => {
  it("rejects unauthenticated multipart before parsing", async () => {
    const app = express();
    app.use((req, res, next) => req.headers.authorization ? next() : res.sendStatus(401));
    app.use(createBoundedUploads());
    app.post("/", (req, res) => res.json({ uploaded: !!req.files }));
    expect((await request(app).post("/").attach("file", Buffer.from("hello"), "x.txt")).status).toBe(401);
    const accepted = await request(app).post("/").set("Authorization", "test").attach("file", Buffer.from("hello"), "x.txt");
    expect(accepted.status).toBe(200);
    expect(accepted.body.uploaded).toBe(true);
  });

  it("rejects aggregate body size and releases admission after completion", async () => {
    const app = express();
    app.use(createBoundedUploads({ maxBytes: 1024, maxConcurrent: 1 }));
    app.post("/", (req, res) => res.sendStatus(200));
    expect((await request(app).post("/").attach("file", Buffer.alloc(2048), "x.txt")).status).toBe(413);
    for (let i = 0; i < 2; i++) {
      expect((await request(app).post("/").attach("file", Buffer.from("ok"), "x.txt")).status).toBe(200);
    }
  });

  it("bounds concurrent uploads while a handler is working", async () => {
    const app = express();
    app.use(createBoundedUploads({ maxConcurrent: 1 }));
    let finish;
    let entered;
    const ready = new Promise(resolve => { entered = resolve; });
    app.post("/", (req, res) => { finish = () => res.sendStatus(200); entered(); });
    const first = request(app).post("/").attach("file", Buffer.from("ok"), "x.txt").then(r => r);
    await ready;
    const second = await request(app).post("/").attach("file", Buffer.from("ok"), "x.txt");
    expect(second.status).toBe(503);
    expect(second.headers["retry-after"]).toBe("5");
    finish();
    expect((await first).status).toBe(200);
  });

  it("enforces the aggregate budget for chunked requests without Content-Length", async () => {
    const app = express();
    app.use(createBoundedUploads({ maxBytes: 1024 }));
    let reachedHandler = false;
    app.post("/", (req, res) => { reachedHandler = true; res.sendStatus(200); });
    const server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    try {
      const status = await new Promise((resolve, reject) => {
        const req = http.request({ port: server.address().port, host: "127.0.0.1", method: "POST",
          headers: { "Content-Type": "multipart/form-data; boundary=test", "Transfer-Encoding": "chunked" } }, res => {
          res.resume();
          res.on("end", () => resolve(res.statusCode));
        });
        req.on("error", reject);
        req.end(`--test\r\nContent-Disposition: form-data; name="file"; filename="x.txt"\r\nContent-Type: text/plain\r\n\r\n${"x".repeat(2048)}\r\n--test--\r\n`);
      });
      expect(status).toBe(413);
      expect(reachedHandler).toBe(false);
    } finally { await new Promise(resolve => server.close(resolve)); }
  });

  it("caps catalog inputs while preserving sitemap and layout limits", async () => {
    const app = express();
    app.get("/categories", categoryList, (req, res) => res.sendStatus(200));
    app.get("/products", productList, (req, res) => res.sendStatus(200));
    app.use(errors());
    for (const query of [{ limit: 201 }, { limit: -1 }, { page: 1.5 }, { search_key: "x".repeat(201) }]) {
      expect((await request(app).get("/categories").query(query)).status).toBe(400);
    }
    expect((await request(app).get("/categories?limit=200")).status).toBe(200);
    expect((await request(app).get("/products?limit=1000")).status).toBe(200);
    expect((await request(app).get("/products?limit=1001")).status).toBe(400);
  });
});
