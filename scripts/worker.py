from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'services/api'))
from terralab.worker import main
main()
