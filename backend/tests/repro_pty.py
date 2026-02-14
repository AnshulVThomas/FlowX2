import asyncio
import sys
import os

# Ensure backend directory is in path
sys.path.append(os.getcwd())

# Mock loop policy if needed (though on Linux asyncio uses default)
# from engine.pty_runner import execute_in_pty

async def run_test():
    try:
        from engine.pty_runner import execute_in_pty
        
        print("\n--- TEST 1: Sudo with Dummy Password (Expect Auth Failure) ---")
        async def printer(data, type):
            print(f"[{type}] {data}", end='', flush=True)

        # Test 1 failure mode
        exit_code, stdout, stderr = await execute_in_pty(
            command="sudo echo 'I am root'",
            sudo_password="wrongpassword123", 
            on_output=printer
        )
        
        print(f"\n[RESULT] ExitCode={exit_code}")
        if exit_code == 1 and ("Incorrect sudo password" in stderr or "Sorry, try again" in stdout):
            print("✅ PASS: Correctly detected auth failure.")
        else:
            print("❌ FAIL: Did not fail auth as expected.")

        print("\n--- TEST 2: Sudo with NO Password (Expect Hang/Timeout) ---")
        try:
             await asyncio.wait_for(
                execute_in_pty(
                    command="sudo -k; sudo echo 'Should Hang'", 
                    sudo_password=None,
                    on_output=printer
                ),
                timeout=5.0
            )
             print("❌ FAIL: It finished? Expected hang.")
        except asyncio.TimeoutError:
             print("\n✅ PASS: Timed out (Hang Confirmed).")
             
    except ImportError as e:
        print(f"Import Error (run from backend dir): {e}")
    except Exception as e:
        print(f"Unexpected Error: {e}")

if __name__ == "__main__":
    if os.path.basename(os.getcwd()) != "backend":
        print("Please run from backend directory!")
        sys.exit(1)
        
    asyncio.run(run_test())
