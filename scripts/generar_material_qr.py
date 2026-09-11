"""Genera material imprimible de Mantenimiento PDT con QR verificables."""
import argparse
from pathlib import Path
from urllib.parse import urlsplit
import re
from xml.sax.saxutils import escape

import qrcode
import zxingcpp
from PIL import Image
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4, letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph

ROOT = Path(__file__).resolve().parents[1]
INK = colors.HexColor('#25221f')
MUTED = colors.HexColor('#64594c')
GOLD = colors.HexColor('#98703b')
PALE = colors.HexColor('#f4eee3')


def setup_fonts():
    fonts = Path('C:/Windows/Fonts')
    pdfmetrics.registerFont(TTFont('PDT', str(fonts / 'arial.ttf')))
    pdfmetrics.registerFont(TTFont('PDT-Bold', str(fonts / 'arialbd.ttf')))
    pdfmetrics.registerFontFamily('PDT', normal='PDT', bold='PDT-Bold')


def paragraph(c, text, x, top, width, size=11, bold=False, center=False):
    style = ParagraphStyle('p', fontName='PDT-Bold' if bold else 'PDT',
                           fontSize=size, leading=size * 1.42, textColor=INK,
                           alignment=TA_CENTER if center else 0)
    p = Paragraph(text, style)
    _, height = p.wrap(width, 1000)
    p.drawOn(c, x, top-height)
    return top-height


def footer(c, width, label, number):
    c.setStrokeColor(GOLD)
    c.setLineWidth(.5)
    c.line(18*mm, 17*mm, width-18*mm, 17*mm)
    c.setFillColor(MUTED)
    c.setFont('PDT', 8)
    c.drawString(18*mm, 12*mm, 'PAN DE TATA  /  ' + label)
    c.drawRightString(width-18*mm, 12*mm, str(number))


def header(c, logo, size, eyebrow, title, page):
    width, height = size
    c.drawImage(str(logo), width-47*mm, height-44*mm, 29*mm, 29*mm, mask='auto')
    c.setFillColor(GOLD)
    c.setFont('PDT-Bold', 9)
    c.drawString(18*mm, height-23*mm, eyebrow)
    paragraph(c, title, 18*mm, height-29*mm, width-72*mm, 23, True)
    footer(c, width, eyebrow, page)
    return height-57*mm


def section(c, number, title, text, y, width):
    y = paragraph(c, f'{number}. {title}', 18*mm, y, width-36*mm, 13, True)
    y = paragraph(c, text, 18*mm, y-3*mm, width-36*mm, 10.6)
    return y-7*mm


def make_qr(url, path):
    qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M,
                       box_size=12, border=4)
    qr.add_data(url)
    qr.make(fit=True)
    qr.make_image(fill_color='black', back_color='white').save(path)
    decoded = zxingcpp.read_barcodes(Image.open(path))
    if [x.text for x in decoded] != [url]:
        raise RuntimeError('El QR no coincide con su destino: ' + str(path))
    return qr.get_matrix()


def vector_qr(c, matrix, x, y, side):
    unit = side / len(matrix)
    c.setFillColor(colors.white)
    c.rect(x, y, side, side, fill=1, stroke=0)
    c.setFillColor(colors.black)
    for r, row in enumerate(matrix):
        for col, active in enumerate(row):
            if active:
                c.rect(x+col*unit, y+(len(matrix)-r-1)*unit,
                       unit, unit, stroke=0, fill=1)


def poster(out, logo, size, form_url, guide_url):
    width, height = size
    form = make_qr(form_url, out/'qr_formulario.png')
    guide = make_qr(guide_url, out/'qr_instructivo.png')
    c = canvas.Canvas(str(out/'Hoja_QR_Pan_de_Tata.pdf'), pagesize=size)
    c.setTitle('Reportar incidencias | Pan de Tata')
    c.setAuthor('Pan de Tata')
    vector_qr(c, guide, 15*mm, height-53*mm, 38*mm)
    c.linkURL(guide_url, (15*mm, height-53*mm, 53*mm, height-15*mm))
    paragraph(c, 'INSTRUCTIVO', 15*mm, height-54*mm, 38*mm, 9, True, True)
    c.drawImage(str(logo), (width-44*mm)/2, height-60*mm, 44*mm, 44*mm, mask='auto')
    paragraph(c, 'REPORTES DE IT<br/>Y MANTENIMIENTO', 15*mm, height-70*mm,
              width-30*mm, 21, True, True)
    paragraph(c, 'Escanea aquí para informar una incidencia', 15*mm, height-96*mm,
              width-30*mm, 12, center=True)
    side = 112*mm
    bottom = height-216*mm
    vector_qr(c, form, (width-side)/2, bottom, side)
    c.linkURL(form_url, ((width-side)/2, bottom, (width+side)/2, bottom+side))
    paragraph(c, '1. Escanea  ·  2. Completa  ·  3. Envía', 15*mm, bottom-3*mm,
              width-30*mm, 12, True, True)
    paragraph(c, 'Selecciona tu ubicación y el equipo afectado.<br/>'
              'Si no aparece, pulsa <b>No encuentro el equipo</b>.',
              20*mm, bottom-15*mm, width-40*mm, 10, center=True)
    c.setFillColor(MUTED)
    c.setFont('PDT', 8)
    c.drawCentredString(width/2, 15*mm, 'Conexión a internet necesaria · Conserva el número de tu reporte')
    c.save()


def user_guide(out, logo, size, form_url):
    width, height = size
    c = canvas.Canvas(str(out/'Instructivo_para_reportar.pdf'), pagesize=size)
    c.setTitle('Cómo realizar un reporte | Pan de Tata')
    y = header(c, logo, size, 'GUÍA DEL USUARIO', 'Cómo realizar\nun reporte', 1)
    items = [
        ('Abre el formulario', 'Escanea el QR grande con la cámara y toca el enlace. Necesitas internet. El QR pequeño abre las instrucciones. Desde allí puedes pulsar <b>Abrir formulario</b>.'),
        ('Elige el tipo de reporte', 'Selecciona <b>Mantenimiento</b> para equipos e instalaciones o <b>IT</b> para incidencias informáticas. Mantenimiento está seleccionado inicialmente.'),
        ('Selecciona ubicación y equipo', 'Elige la <b>Ubicación</b>; después busca por nombre, código o área. Toca el resultado y comprueba la ficha. Para corregir la selección, pulsa <b>Cambiar</b>.'),
        ('Si el equipo no aparece', 'Pulsa <b>No encuentro el equipo</b>. Escribe el equipo o elemento afectado y su ubicación. El área es opcional. No necesitas consultar otra lista ni otro QR.'),
        ('Identifícate y describe la falla', 'Escribe tu nombre; el correo es opcional. Explica qué ocurre, desde cuándo y cómo afecta el trabajo.<br/><b>Ejemplo:</b> El horno no alcanza la temperatura desde las 8:00 a. m.; el calentamiento se detiene a 120 °C.'),
    ]
    for i, (title, text) in enumerate(items, 1):
        y = section(c, i, title, text, y, width)
    if y < 22*mm: raise RuntimeError('Desborde en instructivo, página 1')
    c.showPage()
    y = header(c, logo, size, 'GUÍA DEL USUARIO', 'Envía y conserva\ntu número', 2)
    items = [
        ('Indica estado y prioridad', 'Marca si el equipo está detenido. Selecciona <b>Baja, Media, Alta o Crítica</b> según el impacto y los criterios de tu responsable.'),
        ('Adjunta evidencia si la tienes', 'La foto o el video son opcionales, con máximo de <b>8 MB</b>. Formatos admitidos: JPG, PNG, WEBP, MP4 y MOV. Si pesa más, reduce el tamaño antes de adjuntarlo.'),
        ('Envía una sola vez', 'Pulsa <b>Enviar reporte</b> y espera <b>Reporte registrado</b>. Conserva el número. Usa <b>Crear otro reporte</b> únicamente para una incidencia distinta.'),
        ('Si hay un problema', 'Revisa la conexión si la lista no carga. Sigue el error que muestre el formulario. Si el envío queda sin confirmación, consulta al responsable antes de repetirlo para evitar duplicados.'),
        ('Atención desde Telegram', 'Cuando Telegram está disponible y configurado, el reporte llega al grupo. El personal pulsa <b>Participar</b> para agregarse o vuelve a pulsar para retirarse. Al terminar, pulsa <b>Listo</b> o responde <b>Listo</b> al mensaje. Las acciones pueden tardar alrededor de un minuto más el procesamiento.<br/>El cierre compacta el mensaje a una línea; los detalles y participantes se conservan en el sistema.'),
    ]
    for i, (title, text) in enumerate(items, 6):
        y = section(c, i, title, text, y, width)
    if y < 30*mm: raise RuntimeError('Desborde en instructivo, página 2')
    paragraph(c, f'<link href="{escape(form_url)}" color="#79552a"><b>Abrir formulario de reportes</b></link>',
              18*mm, y, width-36*mm, 11)
    c.save()


def admin_guide(out, logo, size, form_url=None):
    width, height = size
    c = canvas.Canvas(str(out/'Guia_deploy_y_QR.pdf'), pagesize=size)
    c.setTitle('Publicación estable y montaje del QR | Pan de Tata')
    pages = [
        ('Publicar una\ndirección estable', [
            ('El enlace que debes imprimir', 'Usa una implementación con versión y URL terminada en <b>/exec</b>. El enlace <b>/dev</b> es para pruebas con permiso de editor. La URL se conserva al actualizar la misma implementación; el servicio depende de la cuenta, permisos, cuotas y disponibilidad de Google.'),
            ('Elige o crea la implementación', 'Entra al proyecto con la cuenta propietaria. Si ya elegiste una URL /exec, abre <b>Implementar &gt; Administrar implementaciones</b>. Si aún no tienes una definitiva: <b>Implementar &gt; Nueva implementación &gt; Aplicación web</b>. Descripción sugerida: Producción - Mantenimiento PDT.'),
            ('Configura quién puede utilizarla', '<b>Ejecutar como:</b> la cuenta propietaria. Para acceso sin cuenta de Google: <b>Cualquier usuario</b>, incluida la opción sin sesión si se muestra. Esto permite usar el formulario a quien tenga su enlace; no publica el Sheet ni la carpeta de evidencias. Pulsa <b>Implementar</b> y autoriza tu cuenta si Google lo pide.'),
            ('Guarda y comprueba el enlace', 'Copia la URL de aplicación web /exec y el ID de implementación. Abre el enlace desde un teléfono o ventana privada sin sesión del propietario. Comprueba ubicaciones, envío, número, registro en Sheets y Telegram. Es una prueba sobre la base configurada: identifica el reporte como PRUEBA.'),
            ('Comprueba el instructivo', 'El archivo <b>Instructivo.html</b> debe estar incluido en la versión publicada. Abre la URL /exec añadiendo <b>?vista=instructivo</b>. Debe mostrar Cómo realizar un reporte y permitir volver al formulario.'),
        ]),
        ('Actualizar sin\ncambiar los QR', [
            ('Guarda y sube el código', 'Verifica los cambios y haz commit. Desde <b>app/</b> ejecuta <b>npx.cmd --yes @google/clasp push</b>. Esto actualiza el editor, pero no cambia automáticamente la versión web publicada.'),
            ('Prueba antes de publicar', 'Abre <b>Implementar &gt; Implementaciones de prueba</b> y comprueba /dev. Este enlace usa el código guardado más reciente. Las pruebas comparten la base configurada y los activadores de Telegram ejecutan el código guardado del proyecto.'),
            ('Actualiza la misma implementación', 'Ve a <b>Implementar &gt; Administrar implementaciones</b>. Selecciona la URL que imprimiste, pulsa el lápiz y elige <b>Versión &gt; Nueva versión</b>. Añade una descripción breve y pulsa <b>Implementar</b>. La URL y el ID deben seguir iguales.'),
            ('Verifica y revierte si hace falta', 'Escanea los dos QR y comprueba un reporte. Si la versión falla, edita esa misma implementación y selecciona la versión anterior. Esto revierte código, no datos del Sheet. No archives el despliegue impreso ni uses Nueva implementación para cada cambio.'),
            ('Distingue las sincronizaciones', '<b>git push/pull:</b> código entre tu carpeta y GitHub.<br/><b>clasp push:</b> carpeta local hacia el editor de Apps Script.<br/><b>clasp pull:</b> descarga del editor; puede sobrescribir archivos locales.<br/><b>Nueva versión de la misma implementación:</b> actualiza el /exec manteniendo el QR. No hace falta reinstalar Telegram en cada actualización normal.'),
        ]),
        ('Montar la hoja\ny el QR pequeño', [
            ('Configura la página e inserta las imágenes', 'Usa <b>Carta vertical</b> (216 × 279 mm) o A4. Inserta el logo original sin deformar y los archivos <b>qr_formulario.png</b> y <b>qr_instructivo.png</b>. No uses capturas de pantalla.'),
            ('Coloca el instructivo en la esquina', 'Define el QR pequeño en <b>3,8 × 3,8 cm</b>, manteniendo proporción y borde blanco. Ubícalo a <b>1,5 cm del borde izquierdo y superior</b>. Debajo escribe INSTRUCTIVO a 9-10 puntos, separado del código. No lo superpongas al logo.'),
            ('Ajusta el QR principal y el logo', 'El QR grande va centrado a <b>11,2 × 11,2 cm</b>. El logo va centrado arriba. En Word: <b>Ajustar texto &gt; Delante del texto</b> y fija posición en la página. En PowerPoint o Canva colócalos como imágenes. No recortes, estires ni pongas un logo dentro del QR.'),
            ('Exporta y prueba la impresión', 'Exporta a PDF de impresión y usa <b>Tamaño real / 100 %</b>. Escanea ambos QR con dos teléfonos sobre el papel definitivo. El grande debe abrir el formulario y el pequeño el instructivo. Hazlo antes de sacar copias o plastificar; evita reflejos, grapas y chinches sobre los códigos.'),
            ('Qué conservar', 'Guarda la URL /exec, el ID de implementación, los PDF y los PNG originales. El QR pequeño usa la misma dirección más ?vista=instructivo. Podrás corregir las instrucciones al publicar otra versión en la misma implementación sin reimprimir.'),
        ]),
    ]
    for page, (title, items) in enumerate(pages, 1):
        y = header(c, logo, size, 'GUÍA DE ADMINISTRACIÓN', title, page)
        for i, (heading, text) in enumerate(items, 1):
            y = section(c, i, heading, text, y, width)
        if y < 25*mm: raise RuntimeError(f'Desborde en guía administrativa, página {page}: {y/mm}')
        if page == 3:
            paragraph(c, '<link href="https://developers.google.com/apps-script/concepts/deployments" color="#79552a">Fuente: Google - Crear y administrar implementaciones</link><br/><link href="https://developers.google.com/apps-script/guides/web" color="#79552a">Fuente: Google - Aplicaciones web</link>',
                      18*mm, y, width-36*mm, 8)
        c.showPage()
    c.save()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--url')
    parser.add_argument('--logo', required=True, type=Path)
    parser.add_argument('--format', choices=['carta', 'a4'], default='carta')
    parser.add_argument('--out', type=Path, default=ROOT/'output/pdf')
    args = parser.parse_args()
    setup_fonts()
    args.out.mkdir(parents=True, exist_ok=True)
    size = letter if args.format == 'carta' else A4
    if args.url:
        parsed = urlsplit(args.url)
        if (parsed.scheme != 'https' or parsed.netloc != 'script.google.com'
                or not re.fullmatch(r'/macros/s/[A-Za-z0-9_-]+/exec', parsed.path)
                or parsed.query or parsed.fragment):
            raise ValueError('Usa una URL de Apps Script /exec sin parámetros.')
        poster(args.out, args.logo, size, args.url, args.url+'?vista=instructivo')
        user_guide(args.out, args.logo, size, args.url)
    admin_guide(args.out, args.logo, size, args.url)
    print('Archivos generados en ' + str(args.out))


if __name__ == '__main__':
    main()
