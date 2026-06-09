/**
 * DnsServer.js
 * Low-level DNS UDP Packet Parser and Encoder.
 * Translates standard binary DNS query packets and serializes answers.
 */

// Mapping of standard DNS record type values
const TYPE_MAP = {
  A: 1,
  NS: 2,
  CNAME: 5,
  MX: 15,
  TXT: 16
};

const TYPE_NAME_MAP = {
  1: "A",
  2: "NS",
  5: "CNAME",
  15: "MX",
  16: "TXT"
};

/**
 * Parses standard incoming UDP Buffer DNS queries
 * @param {Buffer} buffer 
 * @returns {Object|null} Parsed query details or null
 */
function parseQuery(buffer) {
  if (buffer.length < 12) return null;

  const id = buffer.readUInt16BE(0);
  const flags = buffer.readUInt16BE(2);
  const qdCount = buffer.readUInt16BE(4); // number of questions

  if (qdCount === 0) return null;

  // Parse Domain Name in question section
  let offset = 12;
  const domainParts = [];
  
  while (offset < buffer.length) {
    const len = buffer[offset];
    if (len === 0) {
      offset++; // skip trailing null byte
      break;
    }
    
    if (offset + 1 + len > buffer.length) {
      return null; // out of bounds
    }
    
    const part = buffer.toString("ascii", offset + 1, offset + 1 + len);
    domainParts.push(part);
    offset += 1 + len;
  }

  const domain = domainParts.join(".");
  
  if (offset + 4 > buffer.length) return null;
  const qTypeVal = buffer.readUInt16BE(offset);
  const qClassVal = buffer.readUInt16BE(offset + 2);
  
  const qType = TYPE_NAME_MAP[qTypeVal] || `UNKNOWN(${qTypeVal})`;

  return {
    id,
    flags,
    domain,
    type: qType,
    typeVal: qTypeVal,
    classVal: qClassVal,
    questionSection: buffer.subarray(12, offset + 4) // save standard question raw content
  };
}

/**
 * Encodes domain string into labels format
 * e.g., "google.com" -> [6, 'g', 'o', 'o', 'g', 'l', 'e', 3, 'c', 'o', 'm', 0]
 * @param {string} domain 
 * @returns {Buffer}
 */
function encodeDomain(domain) {
  const parts = domain.split(".");
  const buffers = [];
  
  parts.forEach(part => {
    const lenBuf = Buffer.alloc(1);
    lenBuf[0] = part.length;
    buffers.push(lenBuf);
    buffers.push(Buffer.from(part, "ascii"));
  });
  
  buffers.push(Buffer.alloc(1)); // trailing zero byte
  return Buffer.concat(buffers);
}

/**
 * Creates response DNS binary buffer
 * @param {Object} query The parsed query object from parseQuery
 * @param {Array} answers Array of answer records: { type: 'A'|'CNAME'|..., value: '1.2.3.4'|..., ttl: 300, preference: 10 }
 * @param {boolean} nameError If true, returns NXDOMAIN (RCODE = 3)
 * @returns {Buffer} Response binary buffer
 */
function buildResponse(query, answers = [], nameError = false) {
  const header = Buffer.alloc(12);
  
  // Transaction ID
  header.writeUInt16BE(query.id, 0);
  
  // Flags: Response QR=1, AA=1, RD=1, RA=1, RCODE = nameError ? 3 : 0
  const responseFlags = 0x8480 | (nameError ? 3 : 0);
  header.writeUInt16BE(responseFlags, 2);
  
  // Counts
  header.writeUInt16BE(1, 4); // QDCOUNT (1 question)
  header.writeUInt16BE(nameError ? 0 : answers.length, 6); // ANCOUNT
  header.writeUInt16BE(0, 8); // NSCOUNT
  header.writeUInt16BE(0, 10); // ARCOUNT

  // Question block
  const question = query.questionSection;

  // Answers blocks assembly
  const answerBuffers = [];
  
  if (!nameError) {
    answers.forEach(ans => {
      const typeVal = TYPE_MAP[ans.type];
      if (!typeVal) return;

      const recordHeader = Buffer.alloc(10);
      // Compression pointer 0xc00c pointing to offset 12 (the name in the question)
      recordHeader.writeUInt16BE(0xc00c, 0);
      recordHeader.writeUInt16BE(typeVal, 2); // TYPE
      recordHeader.writeUInt16BE(1, 4);       // CLASS (IN = 1)
      recordHeader.writeUInt32BE(ans.ttl || 300, 6); // TTL

      let rdata;
      if (ans.type === "A") {
        rdata = Buffer.from(ans.value.split(".").map(Number));
      } else if (ans.type === "TXT") {
        // TXT has length byte followed by string chars
        const strBuf = Buffer.from(ans.value, "ascii");
        rdata = Buffer.alloc(1 + strBuf.length);
        rdata[0] = strBuf.length;
        strBuf.copy(rdata, 1);
      } else if (ans.type === "CNAME") {
        rdata = encodeDomain(ans.value);
      } else if (ans.type === "MX") {
        const prefBuf = Buffer.alloc(2);
        prefBuf.writeUInt16BE(ans.preference || 10, 0);
        const domainBuf = encodeDomain(ans.value);
        rdata = Buffer.concat([prefBuf, domainBuf]);
      }

      if (rdata) {
        const lenBuf = Buffer.alloc(2);
        lenBuf.writeUInt16BE(rdata.length, 0); // RDLENGTH
        answerBuffers.push(recordHeader);
        answerBuffers.push(lenBuf);
        answerBuffers.push(rdata);
      }
    });
  }

  return Buffer.concat([header, question, ...answerBuffers]);
}

function buildQuery(id, domain, type) {
  const header = Buffer.alloc(12);
  header.writeUInt16BE(id, 0);
  header.writeUInt16BE(0x0100, 2); // flags: standard query, RD=1
  header.writeUInt16BE(1, 4);      // QDCOUNT = 1
  header.writeUInt16BE(0, 6);
  header.writeUInt16BE(0, 8);
  header.writeUInt16BE(0, 10);

  const question = encodeDomain(domain);
  const typeClass = Buffer.alloc(4);
  typeClass.writeUInt16BE(TYPE_MAP[type] || 1, 0); // QTYPE
  typeClass.writeUInt16BE(1, 2);                  // QCLASS (IN = 1)

  return Buffer.concat([header, question, typeClass]);
}

module.exports = {
  parseQuery,
  buildResponse,
  buildQuery,
  TYPE_MAP,
  TYPE_NAME_MAP
};
