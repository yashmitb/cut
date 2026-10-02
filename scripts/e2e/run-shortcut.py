"""Run a signed .shortcut file's real action chain against a Cut server.

Unpacks the Apple-signed archive (macOS `aea`/`aa`), answers its import
questions, then executes the actions our shortcuts use. Anything else fails
loudly. Usage: run-shortcut.py '{"path": ..., "answers": [...], "choose": ..., "ask": ..., "dictate": ...}'
"""
import json, os, plistlib, shutil, struct, subprocess, sys, tempfile, urllib.error, urllib.parse, urllib.request


def unpack(path):
    d = tempfile.mkdtemp()
    try:
        b = open(path, "rb").read()
        n = struct.unpack("<I", b[8:12])[0]
        open(d + "/leaf.der", "wb").write(plistlib.loads(b[12:12 + n])["SigningCertificateChain"][0])
        pem = subprocess.run(["openssl", "x509", "-inform", "DER", "-in", d + "/leaf.der", "-pubkey", "-noout"], capture_output=True, text=True, check=True).stdout
        open(d + "/pub.pem", "w").write(pem)
        subprocess.run(["aea", "decrypt", "-i", path, "-o", d + "/x.aar", "-sign-pub", d + "/pub.pem"], check=True, capture_output=True)
        subprocess.run(["aa", "extract", "-i", d + "/x.aar", "-d", d + "/out"], check=True, capture_output=True)
        return plistlib.load(open(d + "/out/Shortcut.wflow", "rb"))
    finally:
        shutil.rmtree(d, ignore_errors=True)


def run(path, answers, choose=None, ask=None, dictate=None):
    wf = unpack(path)
    actions = [dict(a) for a in wf["WFWorkflowActions"]]
    for q, ans in zip(wf.get("WFWorkflowImportQuestions", []), answers):
        actions[q["ActionIndex"]]["WFWorkflowActionParameters"][q["ParameterKey"]] = ans
    out, notes = {}, []

    def val(v):
        if isinstance(v, str):
            return v
        if v.get("WFSerializationType") == "WFTextTokenString":
            s, att = v["Value"]["string"], v["Value"].get("attachmentsByRange", {})
            for rng in sorted(att, key=lambda r: -int(r.strip("{}").split(",")[0])):
                i = int(rng.strip("{}").split(",")[0])
                s = s[:i] + str(out[att[rng]["OutputUUID"]]) + s[i + 1:]
            return s
        if v.get("WFSerializationType") == "WFTextTokenAttachment":
            return out[v["Value"]["OutputUUID"]]
        raise SystemExit(f"unknown value {v}")

    for a in actions:
        ident, p = a["WFWorkflowActionIdentifier"].removeprefix("is.workflow.actions."), a["WFWorkflowActionParameters"]
        if ident == "gettext":
            r = val(p.get("WFTextActionText", ""))
        elif ident == "downloadurl":
            assert p.get("WFHTTPMethod", "GET") == "GET"
            try:
                r = urllib.request.urlopen(val(p["WFURL"])).read().decode()
            except urllib.error.HTTPError as e:  # Shortcuts returns the body on 4xx too
                r = e.read().decode()
        elif ident == "text.split":
            assert p["WFTextSeparator"] == "New Lines"
            r = val(p["text"]).split("\n")
        elif ident == "choosefromlist":
            items = val(p["WFInput"])
            assert choose in items, f"{choose!r} not offered in {items}"
            r = choose
        elif ident == "urlencode":
            r = urllib.parse.quote(val(p["WFInput"]), safe="")
        elif ident == "ask":
            r = ask
        elif ident == "dictatetext":
            r = dictate
        elif ident == "notification":
            notes.append(val(p["WFNotificationActionBody"]))
            r = None
        else:
            raise SystemExit(f"unsupported action {ident}")
        if "UUID" in p:
            out[p["UUID"]] = r
    return notes


if __name__ == "__main__":
    print(json.dumps(run(**json.loads(sys.argv[1]))))
