import pathway as pw
import time
import threading

GLOBAL_VAL = 1

def updater():
    global GLOBAL_VAL
    time.sleep(2)
    GLOBAL_VAL = 100
    print("Updated GLOBAL_VAL to 100")
    time.sleep(2)
    GLOBAL_VAL = 200
    print("Updated GLOBAL_VAL to 200")

threading.Thread(target=updater, daemon=True).start()

class InputSchema(pw.Schema):
    val: int

t = pw.io.csv.read("test_input.csv", schema=InputSchema, mode="streaming")

@pw.udf
def add_global(x: int) -> int:
    return x + GLOBAL_VAL

res = t.select(result=add_global(pw.this.val))

pw.io.csv.write(res, "test_output.csv")
pw.run()
