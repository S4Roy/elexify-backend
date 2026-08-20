import { describe, expect, it, beforeEach } from "vitest";
import { mockClient } from "aws-sdk-client-mock";
import {
  S3Client,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { Readable } from "stream";
import { s3Handler } from "./s3Handler.js";

// No real AWS credentials available here, so this mocks the S3Client's
// `send` call (aws-sdk-client-mock) — verifies the right Command class +
// params get sent per method, since a future edit could silently swap in
// the wrong one without this catching it.
const s3Mock = mockClient(S3Client);

beforeEach(() => {
  s3Mock.reset();
});

describe("s3Handler (AWS SDK v3)", () => {
  it("uploadToS3 sends a PutObjectCommand with the file buffer/mimetype", async () => {
    s3Mock.on(PutObjectCommand).resolves({});

    const file = { data: Buffer.from("hello"), mimetype: "text/plain" };
    const result = await s3Handler.uploadToS3(file, "uploads/hello.txt");

    expect(result).toContain("uploads/hello.txt");
    const calls = s3Mock.commandCalls(PutObjectCommand);
    expect(calls).toHaveLength(1);
    expect(calls[0].args[0].input).toMatchObject({
      Key: "uploads/hello.txt",
      Body: file.data,
      ContentType: "text/plain",
      CacheControl: "public, max-age=31536000, immutable",
      ACL: "public-read",
    });
  });

  it("uploadToS3 rejects when no file is provided", async () => {
    await expect(s3Handler.uploadToS3(null)).rejects.toThrow("No file provided");
  });

  it("checkKey returns true when HeadObjectCommand resolves, false when it rejects", async () => {
    s3Mock.on(HeadObjectCommand).resolvesOnce({}).rejectsOnce(new Error("Not Found"));

    expect(await s3Handler.checkKey({ bucket: "b", key: "exists.txt" })).toBe(true);
    expect(await s3Handler.checkKey({ bucket: "b", key: "missing.txt" })).toBe(false);
  });

  it("readStream sends GetObjectCommand and returns the response Body", async () => {
    const bodyStream = Readable.from([Buffer.from("content")]);
    s3Mock.on(GetObjectCommand).resolves({ Body: bodyStream });

    const body = await s3Handler.readStream({ bucket: "b", key: "file.txt" });
    const chunks = [];
    for await (const chunk of body) chunks.push(chunk);
    expect(Buffer.concat(chunks).toString()).toBe("content");

    expect(s3Mock.commandCalls(GetObjectCommand)[0].args[0].input).toMatchObject({
      Bucket: "b",
      Key: "file.txt",
    });
  });

  it("deleteObject sends a DeleteObjectCommand for the given bucket/key", async () => {
    s3Mock.on(DeleteObjectCommand).resolves({});

    await s3Handler.deleteObject({ bucket: "b", key: "to-delete.txt" });

    expect(s3Mock.commandCalls(DeleteObjectCommand)[0].args[0].input).toMatchObject({
      Bucket: "b",
      Key: "to-delete.txt",
    });
  });
});
