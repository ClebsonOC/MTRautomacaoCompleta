import sys
import os
import json
import fitz  # PyMuPDF
from PIL import Image
import base64
import io
import tempfile

# --- FUNÇÕES DE LÓGICA DE ARQUIVOS ---

def load_driver_positions_from_txt(file_path):
    """Carrega posições de motoristas de um arquivo TXT, tratando valores como floats."""
    positions = {}
    if not os.path.exists(file_path): return positions
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith('#'): continue
                try:
                    name, x, y, w, h = [p.strip() for p in line.split(';', 4)]
                    # Alterado para float para maior precisão
                    positions[name.upper()] = tuple(map(float, [x, y, w, h]))
                except (ValueError, IndexError):
                    print(f"Aviso: Linha de motorista mal formatada: {line}", file=sys.stderr)
    except Exception as e:
        print(f"Erro ao carregar posicoes.txt: {e}", file=sys.stderr)
    return positions

def load_responsavel_positions_from_json(file_path):
    """Carrega posições de responsáveis de um arquivo JSON. Os valores já são numéricos (float/int)."""
    if not os.path.exists(file_path) or os.path.getsize(file_path) == 0:
        return {}
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
            # Garante que as chaves estão em maiúsculo para consistência
            return {k.upper(): v for k, v in data.items()}
    except (json.JSONDecodeError, FileNotFoundError) as e:
        print(f"Aviso: Não foi possível ler o JSON de posições de responsáveis: {e}", file=sys.stderr)
        return {}

def save_position_to_file(file_path, sig_type, sig_name, pos):
    """Salva a posição no arquivo apropriado (TXT ou JSON) como floats."""
    key_name_orig = os.path.splitext(sig_name)[0]
    key_name_upper = key_name_orig.upper()
    
    # Converte as posições para float para garantir a precisão
    x, y, w, h = float(pos['x']), float(pos['y']), float(pos['w']), float(pos['h'])

    if sig_type == 'driver':
        lines = []
        found = False
        if os.path.exists(file_path):
            with open(file_path, 'r', encoding='utf-8') as f:
                lines = f.readlines()
        
        with open(file_path, 'w', encoding='utf-8') as f:
            for line in lines:
                if line.strip().upper().startswith(key_name_upper + ';'):
                    f.write(f"{key_name_orig};{x};{y};{w};{h}\n")
                    found = True
                else:
                    f.write(line)
            if not found:
                f.write(f"{key_name_orig};{x};{y};{w};{h}\n")
    else: 
        positions = {}
        if os.path.exists(file_path) and os.path.getsize(file_path) > 0:
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    positions = json.load(f)
            except json.JSONDecodeError:
                pass
        
        positions[key_name_orig] = [x, y, w, h]
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(positions, f, indent=4, ensure_ascii=False)
            
    print(f"Posição para '{key_name_orig}' salva com sucesso.", file=sys.stdout)


# --- FUNÇÕES DE LÓGICA DE NEGÓCIO ---

def get_signature_files(subscriptions_path):
    """Retorna uma lista de nomes de arquivos de imagem dos responsáveis."""
    responsaveis_path = os.path.join(subscriptions_path, '0 - RESPONSÁVEIS')
    if not os.path.exists(responsaveis_path): return []
    return [f for f in os.listdir(responsaveis_path) if f.lower().endswith(('.png', '.jpg', '.jpeg'))]

def get_driver_names(subscriptions_path):
    """Retorna uma lista de nomes de motoristas (baseado nos nomes dos arquivos)."""
    drivers_path = os.path.join(subscriptions_path, 'MOTORISTAS')
    if not os.path.exists(drivers_path): return []
    return [os.path.splitext(f)[0] for f in os.listdir(drivers_path) if f.lower().endswith(('.png', '.jpg', '.jpeg'))]

def prepare_signature_image(image_path):
    """
    Carrega uma imagem, remove o fundo branco, corta o excesso de transparência,
    e retorna os bytes da imagem PNG transparente.
    Retorna None se a imagem não puder ser processada.
    """
    if not image_path or not os.path.exists(image_path):
        return None
    try:
        with Image.open(image_path) as img:
            img = img.convert("RGBA")
            datas = img.getdata()
            newData = []
            for item in datas:
                if item[0] > 220 and item[1] > 220 and item[2] > 220:
                    newData.append((255, 255, 255, 0))
                else:
                    newData.append(item)
            img.putdata(newData)
            bbox = img.getbbox()
            if bbox:
                img = img.crop(bbox)
            buffered = io.BytesIO()
            img.save(buffered, format="PNG")
            return buffered.getvalue()
    except Exception as e:
        print(f"Aviso: Falha ao processar a imagem {os.path.basename(image_path)}: {e}", file=sys.stderr)
        return None

# --- FUNÇÕES DE COMANDO ---

def get_signature_config(subscriptions_path, driver_pos_path, resp_pos_path):
    try:
        driver_positions = load_driver_positions_from_txt(driver_pos_path)
        resp_positions = load_responsavel_positions_from_json(resp_pos_path)
        
        responsaveis = [{
            "name": f,
            "displayName": os.path.splitext(f)[0],
            "has_position_defined": os.path.splitext(f)[0].upper() in resp_positions
        } for f in get_signature_files(subscriptions_path)]

        drivers = [{
            "name": name,
            "has_position_defined": name.upper() in driver_positions
        } for name in get_driver_names(subscriptions_path)]
        
        print(json.dumps({"responsaveis": responsaveis, "drivers": drivers}))
    except Exception as e:
        print(f"Erro em get_signature_config: {e}", file=sys.stderr)
        sys.exit(1)

def get_preview(sig_name, sig_type, input_path, subs_path, driver_pos_path, resp_pos_path):
    try:
        key_name = os.path.splitext(sig_name)[0].upper()
        
        if sig_type == 'responsavel':
            positions = load_responsavel_positions_from_json(resp_pos_path)
            sig_path = os.path.join(subs_path, '0 - RESPONSÁVEIS', sig_name)
        else: # driver
            positions = load_driver_positions_from_txt(driver_pos_path)
            driver_sig_folder = os.path.join(subs_path, 'MOTORISTAS')
            sig_path = next((os.path.join(driver_sig_folder, f) for f in os.listdir(driver_sig_folder) if os.path.splitext(f)[0].upper() == key_name), None)

        pos_data = positions.get(key_name)
        # Envia a posição como um dicionário com chaves, o que é mais robusto
        position = {"x": pos_data[0], "y": pos_data[1], "w": pos_data[2], "h": pos_data[3]} if pos_data else None

        signature_bytes = prepare_signature_image(sig_path)
        signature_base64 = base64.b64encode(signature_bytes).decode('utf-8') if signature_bytes else None

        page_base64, page_width, page_height = (None, 0, 0)
        pdf_found = False
        for dirpath, _, filenames in os.walk(input_path):
            for f in filenames:
                if f.lower().endswith('.pdf'):
                    try:
                        with fitz.open(os.path.join(dirpath, f)) as doc:
                            if len(doc) > 0:
                                page = doc.load_page(0)
                                # Dimensões da página em pontos (unidade do PDF)
                                page_width = page.rect.width
                                page_height = page.rect.height
                                # Renderiza a página com alta resolução para uma boa visualização
                                pix = page.get_pixmap(dpi=200) 
                                buffer = io.BytesIO(pix.tobytes("png"))
                                page_base64 = base64.b64encode(buffer.getvalue()).decode('utf-8')
                                pdf_found = True
                                break
                    except Exception as e:
                        print(f"Aviso: não foi possível ler o PDF {f}. Erro: {e}", file=sys.stderr)
            if pdf_found:
                break
        
        print(json.dumps({
            "page_base64": page_base64, 
            "page_width": page_width,
            "page_height": page_height,
            "signature_base64": signature_base64, 
            "position": position
        }))
    except Exception as e:
        print(f"Erro em get_preview para '{sig_name}': {e}", file=sys.stderr)
        sys.exit(1)

def process_pdfs(input_path, output_path, subs_path, driver_pos_path, resp_pos_path, emissor_file, receptor_file):
    try:
        print("Iniciando processamento...", file=sys.stderr)
        driver_positions = load_driver_positions_from_txt(driver_pos_path)
        resp_positions = load_responsavel_positions_from_json(resp_pos_path)
        
        emissor_key = os.path.splitext(emissor_file)[0].upper()
        receptor_key = os.path.splitext(receptor_file)[0].upper()

        if emissor_key not in resp_positions:
            print(f"ERRO: Posição para emissor '{emissor_file}' não definida.", file=sys.stderr)
            return
        if receptor_key not in resp_positions:
            print(f"ERRO: Posição para receptor '{receptor_file}' não definida.", file=sys.stderr)
            return

        emissor_path = os.path.join(subs_path, '0 - RESPONSÁVEIS', emissor_file)
        receptor_path = os.path.join(subs_path, '0 - RESPONSÁVEIS', receptor_file)
        emissor_bytes = prepare_signature_image(emissor_path)
        receptor_bytes = prepare_signature_image(receptor_path)

        if not emissor_bytes or not receptor_bytes:
            print(f"ERRO: Falha ao processar imagem do emissor ou receptor.", file=sys.stderr)
            return

        for driver_name in os.listdir(input_path):
            driver_input_folder = os.path.join(input_path, driver_name)
            if not os.path.isdir(driver_input_folder): continue

            driver_key = driver_name.upper()
            if driver_key not in driver_positions:
                print(f"Aviso: Posição para motorista '{driver_name}' não definida. Pulando.", file=sys.stderr)
                continue

            driver_sig_folder = os.path.join(subs_path, 'MOTORISTAS')
            driver_sig_path = next((os.path.join(driver_sig_folder, f) for f in os.listdir(driver_sig_folder) if os.path.splitext(f)[0].upper() == driver_key), None)
            
            driver_bytes = prepare_signature_image(driver_sig_path)
            if not driver_bytes:
                print(f"Aviso: Assinatura para motorista '{driver_name}' não encontrada ou falhou ao processar. Pulando.", file=sys.stderr)
                continue

            driver_output_folder = os.path.join(output_path, driver_name)
            os.makedirs(driver_output_folder, exist_ok=True)

            for filename in os.listdir(driver_input_folder):
                if not filename.lower().endswith('.pdf'): continue
                try:
                    doc_path = os.path.join(driver_input_folder, filename)
                    with fitz.open(doc_path) as doc:
                        for page in doc:
                            # Usa as coordenadas float diretamente. fitz.Rect aceita floats.
                            x, y, w, h = resp_positions[emissor_key]
                            page.insert_image(fitz.Rect(x, y, x + w, y + h), stream=emissor_bytes)
                            
                            x, y, w, h = resp_positions[receptor_key]
                            page.insert_image(fitz.Rect(x, y, x + w, y + h), stream=receptor_bytes)
                            
                            x, y, w, h = driver_positions[driver_key]
                            page.insert_image(fitz.Rect(x, y, x + w, y + h), stream=driver_bytes)

                        doc.save(os.path.join(driver_output_folder, filename), garbage=4, deflate=True, clean=True)
                    print(f"Processado: {driver_name}/{filename}", file=sys.stderr)
                except Exception as e:
                    print(f"Erro ao processar o arquivo {filename}: {e}", file=sys.stderr)
        
        print("Processamento concluído com sucesso!")
    except Exception as e:
        print(f"Erro inesperado em 'process_pdfs': {e}", file=sys.stderr)
        sys.exit(1)

# --- ROTEADOR DE COMANDOS ---
if __name__ == "__main__":
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')

    if len(sys.argv) < 2:
        print("Erro: Nenhum comando fornecido.", file=sys.stderr)
        sys.exit(1)

    cmd = sys.argv[1]
    
    if cmd == "get_signature_config":
        get_signature_config(sys.argv[2], sys.argv[3], sys.argv[4])
    elif cmd == "get_preview":
        get_preview(sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5], sys.argv[6], sys.argv[7])
    elif cmd == "save_position":
        # Os valores já chegam como strings que podem representar floats
        pos = {"x": sys.argv[4], "y": sys.argv[5], "w": sys.argv[6], "h": sys.argv[7]}
        save_position_to_file(sys.argv[8], sys.argv[3], sys.argv[2], pos)
    elif cmd == "process_pdfs":
        process_pdfs(sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5], sys.argv[6], sys.argv[7], sys.argv[8])
    else:
        print(f"Erro: Comando desconhecido '{cmd}'", file=sys.stderr)
        sys.exit(1)
