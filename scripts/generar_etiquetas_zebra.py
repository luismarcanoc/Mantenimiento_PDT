"""Genera etiquetas Zebra ZPL desde la hoja EQUIPOS de Mantenimiento PDT.

Conserva el formato histórico: 406 x 203 puntos (50,8 x 25,4 mm a 203 dpi).
Cada QR abre el formulario nuevo con el equipo preseleccionado.
"""
from __future__ import annotations

import argparse
import csv
import re
import shutil
import unicodedata
import zipfile
from pathlib import Path
from urllib.parse import quote

import openpyxl

ROOT = Path(__file__).resolve().parents[1]
FORM_URL = "https://script.google.com/macros/s/AKfycbyloFTlhmSDMk5zlMUyC95zBX68RIQxqLaoNI6f99flq5l-fuuYcpPyHctTEAeadnCgiw/exec"
LABEL_WIDTH_DOTS = 406
LABEL_HEIGHT_DOTS = 203


def clean(value: object) -> str:
    text = "" if value is None else str(value).strip()
    text = re.sub(r"\s+", " ", text)
    return text


def zpl_text(value: object, limit: int = 80) -> str:
    text = clean(value).replace("^", " ").replace("~", " ")
    # La fuente Zebra A0 no imprime de forma consistente todos los acentos.
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    return text[:limit]


def rows_from_workbook(path: Path) -> list[dict[str, object]]:
    workbook = openpyxl.load_workbook(path, read_only=True, data_only=True)
    sheet = workbook["EQUIPOS"]
    rows = sheet.iter_rows(values_only=True)
    headers = [clean(value) for value in next(rows)]
    result = []
    for values in rows:
        item = dict(zip(headers, values))
        code = clean(item.get("CODIGO_EQUIPO"))
        if not code:
            continue
        if clean(item.get("ESTATUS")).lower() == "descontinuado":
            continue
        result.append(item)
    return result


def build_zpl(item: dict[str, object], form_url: str) -> str:
    code = clean(item["CODIGO_EQUIPO"])
    target = f"{form_url}?equipo={quote(code, safe='')}"
    name = zpl_text(item.get("NOMBRE") or item.get("NOMBRE_ORIGINAL"), 42)
    info = zpl_text(item.get("INFORMACION") or item.get("MARCA"), 34)
    location = zpl_text(item.get("UBICACION"), 28)
    area = zpl_text(item.get("AREA"), 32)
    return f"""^XA
^CI28
^MMT
^PW{LABEL_WIDTH_DOTS}
^LL{LABEL_HEIGHT_DOTS:04d}
^LS0
^FO10,10^A0N,25,24^FB185,2,1,L,0^FD{name}^FS
^FO10,67^A0N,23,22^FD{zpl_text(code, 24)}^FS
^FO10,96^A0N,18,17^FB185,1,0,L,0^FD{info}^FS
^FO10,120^A0N,21,19^FB185,1,0,L,0^FD{location}^FS
^FO10,147^A0N,17,16^FB185,2,0,L,0^FD{area}^FS
^FO213,5^BQN,2,3^FDLA,{target}^FS
^FO225,181^A0N,15,14^FDREPORTAR^FS
^PQ1,0,1,Y
^XZ
"""


def write_outputs(rows: list[dict[str, object]], out: Path, form_url: str) -> None:
    individual = out / "individuales"
    if individual.exists():
        shutil.rmtree(individual)
    individual.mkdir(parents=True, exist_ok=True)

    csv_path = out / "equipos_etiquetas.csv"
    with csv_path.open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.writer(stream)
        writer.writerow(["CODIGO_EQUIPO", "NOMBRE", "INFORMACION", "UBICACION", "AREA", "URL_QR"])
        for item in rows:
            code = clean(item["CODIGO_EQUIPO"])
            writer.writerow([
                code,
                clean(item.get("NOMBRE") or item.get("NOMBRE_ORIGINAL")),
                clean(item.get("INFORMACION") or item.get("MARCA")),
                clean(item.get("UBICACION")),
                clean(item.get("AREA")),
                f"{form_url}?equipo={quote(code, safe='')}",
            ])

    master_path = out / "Etiquetas_Mantenimiento_PDT_50x25_203dpi.prn"
    with master_path.open("w", encoding="utf-8", newline="\n") as master:
        for item in rows:
            code = clean(item["CODIGO_EQUIPO"])
            zpl = build_zpl(item, form_url)
            (individual / f"{code}.zpl").write_text(zpl, encoding="utf-8", newline="\n")
            master.write(zpl)

    zip_path = out / "Etiquetas_Mantenimiento_PDT_individuales.zip"
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(individual.glob("*.zpl")):
            archive.write(path, arcname=path.name)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--xlsx", type=Path, required=True)
    parser.add_argument("--out", type=Path, default=ROOT / "output" / "etiquetas")
    parser.add_argument("--url", default=FORM_URL)
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    rows = rows_from_workbook(args.xlsx)
    write_outputs(rows, args.out, args.url.rstrip("/"))
    print(f"Etiquetas generadas: {len(rows)}")
    print(f"Formato: {LABEL_WIDTH_DOTS} x {LABEL_HEIGHT_DOTS} puntos, 203 dpi")
    print(f"Salida: {args.out.resolve()}")


if __name__ == "__main__":
    main()
