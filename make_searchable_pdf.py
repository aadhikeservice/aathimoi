import sys, os, io
from html.parser import HTMLParser
import pypdf
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

sys.stdout.reconfigure(encoding='utf-8')

class A4PageExtractor(HTMLParser):
    def __init__(self):
        super().__init__()
        self.pages = []
        self.current_page_lines = []
        self.current_line_tokens = []
        self.in_page = False
        self.ignore_depth = 0
        self.block_tags = {'tr', 'p', 'h1', 'h2', 'h3', 'h4', 'li'}

    def handle_starttag(self, tag, attrs):
        if tag in {'style', 'script', 'head', 'svg', 'noscript'}:
            self.ignore_depth += 1
            return

        attrs_dict = dict(attrs)
        classes = attrs_dict.get('class', '').split()
        if 'a4-page' in classes:
            self._flush_line()
            if self.in_page and self.current_page_lines:
                self.pages.append(self.current_page_lines)
            self.in_page = True
            self.current_page_lines = []
            return

        if not self.in_page and tag == 'body':
            self.in_page = True
            self.current_page_lines = []

        if self.in_page and self.ignore_depth == 0:
            if tag in self.block_tags:
                self._flush_line()

    def handle_endtag(self, tag):
        if tag in {'style', 'script', 'head', 'svg', 'noscript'}:
            if self.ignore_depth > 0:
                self.ignore_depth -= 1
            return

        if self.in_page and self.ignore_depth == 0:
            if tag in self.block_tags or tag in {'div'}:
                self._flush_line()

    def handle_data(self, data):
        if self.in_page and self.ignore_depth == 0:
            text = ' '.join(data.strip().split())
            if text:
                self.current_line_tokens.append(text)

    def _flush_line(self):
        if self.current_line_tokens:
            line = ' '.join(self.current_line_tokens).strip()
            if line and (not self.current_page_lines or self.current_page_lines[-1] != line):
                self.current_page_lines.append(line)
            self.current_line_tokens = []

    def finish(self):
        self._flush_line()
        if self.current_page_lines:
            self.pages.append(self.current_page_lines)
        return self.pages

def extract_pages_from_html(html_path):
    with open(html_path, 'r', encoding='utf-8', errors='replace') as f:
        content = f.read()
    parser = A4PageExtractor()
    parser.feed(content)
    return parser.finish()

def get_tamil_font():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    font_candidates = [
        os.path.join(base_dir, 'fonts', 'MuktaMalar-Regular.ttf'),
        os.path.join(base_dir, 'public', 'fonts', 'MuktaMalar-Regular.ttf'),
        os.path.join(base_dir, '..', 'fonts', 'MuktaMalar-Regular.ttf'),
        os.path.abspath(os.path.join('fonts', 'MuktaMalar-Regular.ttf')),
        os.path.abspath(os.path.join('public', 'fonts', 'MuktaMalar-Regular.ttf')),
        r'C:\Windows\Fonts\Nirmala.ttf',
        r'C:\Windows\Fonts\NirmalaB.ttf'
    ]
    for cand in font_candidates:
        if os.path.exists(cand):
            try:
                pdfmetrics.registerFont(TTFont('MuktaMalarSearch', cand))
                return 'MuktaMalarSearch'
            except Exception as e:
                print(f"[SearchableLayer] Notice registering {cand}: {e}")
    return 'Helvetica'

def add_searchable_layer(pdf_path, html_path, out_pdf_path=None):
    if not out_pdf_path:
        out_pdf_path = pdf_path

    font_name = get_tamil_font()
    pages_text = extract_pages_from_html(html_path)

    reader = pypdf.PdfReader(pdf_path)
    writer = pypdf.PdfWriter()

    for idx, page in enumerate(reader.pages):
        packet = io.BytesIO()
        width = float(page.mediabox.width)
        height = float(page.mediabox.height)
        can = canvas.Canvas(packet, pagesize=(width, height))
        
        # Mode 3 Tr = invisible text in PDF specification
        can._code.append('3 Tr')
        
        lines = pages_text[idx] if idx < len(pages_text) else []
        n_lines = max(len(lines), 1)
        # Compute line height to fit all lines cleanly on page without truncation
        top_y = height - 40.0
        bottom_y = 30.0
        available_h = top_y - bottom_y
        line_height = min(13.0, max(6.0, available_h / n_lines))
        font_size = min(9.0, max(5.0, line_height * 0.8))

        can.setFont(font_name, font_size)

        cur_y = top_y
        for l in lines:
            if cur_y < 15.0:
                break
            try:
                can.drawString(30.0, cur_y, l)
            except Exception:
                # If specific character not supported, draw ascii/clean fallback
                clean_l = l.encode('ascii', 'replace').decode('ascii')
                can.drawString(30.0, cur_y, clean_l)
            cur_y -= line_height

        can._code.append('0 Tr') # Reset rendering mode
        can.save()

        packet.seek(0)
        overlay_pdf = pypdf.PdfReader(packet)
        if len(overlay_pdf.pages) > 0:
            page.merge_page(overlay_pdf.pages[0])
        writer.add_page(page)

    tmp_out = out_pdf_path + '.tmp'
    with open(tmp_out, 'wb') as f:
        writer.write(f)
    os.replace(tmp_out, out_pdf_path)
    print(f"[SearchableLayer] Successfully added text layer to {out_pdf_path}")

if __name__ == '__main__':
    if len(sys.argv) >= 3:
        pdf_file = sys.argv[1]
        html_file = sys.argv[2]
        out_file = sys.argv[3] if len(sys.argv) >= 4 else pdf_file
        add_searchable_layer(pdf_file, html_file, out_file)
    else:
        print("Usage: python make_searchable_pdf.py <pdf_path> <html_path> [out_pdf_path]")
