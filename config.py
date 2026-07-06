"""
路径配置文件 - 管理合同相关路径
先读取 config.json，没有则用默认值
"""
import os
import json

CONFIG_FILE = os.path.join(os.path.dirname(__file__), 'config.json')

DEFAULT_CONFIG = {
    "address_dir": r"D:\地址\地址材料",
    "template_path": r"D:\地址\租赁合同模板.docx",
    "output_base": r"D:\地址\地址合同",
    "font_path": r"C:\Windows\Fonts\simkai.ttf"
}

_config = None


def load_config():
    global _config
    if _config is not None:
        return _config
    _config = dict(DEFAULT_CONFIG)
    if os.path.isfile(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
                for k in _config:
                    if k in data and data[k]:
                        _config[k] = data[k]
        except:
            pass
    # 确保必要目录存在
    os.makedirs(_config['address_dir'], exist_ok=True)
    os.makedirs(_config['output_base'], exist_ok=True)
    return _config


def save_config(new_config):
    global _config
    cfg = load_config()
    for k in cfg:
        if k in new_config and new_config[k]:
            cfg[k] = new_config[k]
    with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
        json.dump(cfg, f, ensure_ascii=False, indent=2)
    _config = cfg
    return cfg


def get(key):
    cfg = load_config()
    return cfg.get(key)


def get_all():
    return dict(load_config())
