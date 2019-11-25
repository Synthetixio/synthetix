class TERMCOLORS:
    BLUE = '\033[94m'
    GREEN = '\033[92m'
    YELLOW = '\033[93m'
    RED = '\033[91m'
    BOLD = '\033[1m'
    RESET = '\033[0m'


def to_seconds(seconds=0, minutes=0, hours=0, days=0, weeks=0):
    total_time = seconds
    mult = 60
    total_time += minutes * mult
    mult *= 60
    total_time += hours * mult
    mult *= 24
    total_time += days * mult
    mult *= 7
    total_time += weeks * mult
    return total_time


ganache_error_message = f"""{TERMCOLORS.RED}
Error running ganache-cli.
If it is missing, it can be installed with `npm install -g ganache-cli`.
"""

TEST_SETTINGS_FILE = "test_settings.py"


def generate_default_test_settings():
    import tests
    return {
        i: True for i in dir(tests) if i.startswith('test_')
    }


def refresh_test_settings():
    default_test_settings = generate_default_test_settings()
    with open(TEST_SETTINGS_FILE, 'w') as f:
        f.write("run_test = {\n")
        for test_name in default_test_settings:
            f.write(f"    '{test_name}': True,\n")
        f.write('}\n')


def load_test_settings():
    default_test_settings = generate_default_test_settings()
    try:
        from test_settings import run_test as r
        for item in default_test_settings:
            if item not in r:
                raise ImportError
        return r
    except ImportError:
        refresh_test_settings()
        return default_test_settings
