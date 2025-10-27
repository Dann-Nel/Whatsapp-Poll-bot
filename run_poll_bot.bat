@echo off
REM This script should be run from within the bot's main folder.

REM Activate the virtual environment
call .\venv\Scripts\activate

REM Run the python script
echo "Starting the WhatsApp Poll Bot..."
python poll_sender.py
echo "Script finished."

REM The pause command is removed for automated execution.Of course. I've conducted a thorough review of all your project files, including the extensive poll_bot.log. The logs are very revealing and point to a few critical issues that are preventing your bot from working reliably.

The good news is that these are common problems in web automation, and they can be fixed by making the script more robust.

Analysis: Why the Bot is Failing
Based on the logs, the bot is failing for two primary reasons:

"Zombie" Browser Processes (The Main Culprit): Your log file is filled with errors like session not created: probably user data directory is already in use and invalid session id.

Cause: This is happening because your script uses options.add_experimental_option("detach", True), which tells the browser window to stay open after the script finishes. However, the finally block never calls driver.quit(). This means an invisible Chrome process is left running in the background, locking the user profile folder. When the scheduler tries to run the bot again, it can't access the locked folder and crashes.
Solution: For a scheduled task, the browser must be closed properly after every run. We need to remove the detach option and ensure driver.quit() is always called.
Brittle Selectors and Race Conditions: The logs also show many TIMEOUT OCCURRED errors, especially when waiting for the "Attach" button or the "Allow multiple answers" toggle.

Cause: WhatsApp Web's interface can be slow to update. The script sometimes tries to find a button before the page has fully rendered it, leading to a timeout.
Solution: We can make the script more resilient by adding more specific waits and improving the error handling to provide more useful debug information.
Code Improvements for Reliability
I will now provide the necessary changes to fix these issues and make your bot significantly more stable.

1. Update poll_sender.py for Robustness
These changes will ensure the browser closes correctly and will make the error logging more helpful for future debugging.

poll_sender.py
-8
+14
 Show full code block 
import logging
import os
import time
from selenium import webdriver
from selenium.webdriver.remote.remote_connection import LOGGER as SELENIUM_LOGGER
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.service import Service
from selenium.common.exceptions import TimeoutException, NoSuchElementException

# --- Setup Logging ---
# Suppress noisy Selenium logs to keep our log file clean
SELENIUM_LOGGER.setLevel(logging.WARNING)

# This will create a 'poll_bot.log' file to record what happens
logging.basicConfig(
    filename='poll_bot.log',
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    encoding='utf-8'
)

# --- Configuration ---
# Path to your ChromeDriver executable
# Make sure this path is correct for your system.
# You can download it from: https://chromedriver.chromium.org/downloads
CHROME_DRIVER_PATH = "C:\\Users\\dannn.DANN-NEL_LAPTOP\\Downloads\\chromedriver-win64\\chromedriver.exe"

# The name of the WhatsApp group or contact to send the poll to
TARGET_CHAT_NAME = "Test Group" # <<< CHANGE THIS TO YOUR TARGET GROUP/CONTACT NAME

# Poll details
POLL_QUESTION = "What is your favorite color?"
POLL_OPTIONS = ["Red", "Blue", "Green", "Yellow"]

# --- Main Bot Logic ---
def run_whatsapp_poll_bot():
    driver = None # Initialize driver to None
    try:
        logging.info("Starting WhatsApp Poll Bot...")

        # Set up Selenium service and options
        service = Service(executable_path=CHROME_DRIVER_PATH)
        options = webdriver.ChromeOptions()

        # The "detach" option MUST be disabled for scheduled tasks. It leaves "zombie"
        # browser processes running, which causes the "user data directory is already in use" error.
        # options.add_experimental_option("detach", True)

        # Create a stable profile path in the user's AppData folder to avoid permission issues.
        # This ensures WhatsApp Web stays logged in across sessions.
        profile_path = os.path.join(os.getenv('LOCALAPPDATA'), 'WhatsAppPollBot', 'user_data')
        options.add_argument(f"user-data-dir={profile_path}")
        logging.info(f"Using user data directory: {profile_path}")

        # Initialize the WebDriver
        driver = webdriver.Chrome(service=service, options=options)
        driver.get("https://web.whatsapp.com/")
        logging.info("WhatsApp Web opened. Waiting for QR code scan (if not already logged in)...")

        # Wait for WhatsApp Web to load (presence of the search bar is a good indicator)
        wait = WebDriverWait(driver, 60) # Increased timeout for initial load
        wait.until(EC.presence_of_element_located((By.XPATH, '//div[@contenteditable="true"][@data-tab="3"]')))
        logging.info("WhatsApp Web loaded successfully.")

        # 1. Search for the target chat
        logging.info(f"Searching for chat: {TARGET_CHAT_NAME}")
        search_box = wait.until(EC.element_to_be_clickable((By.XPATH, '//div[@contenteditable="true"][@data-tab="3"]')))
        search_box.clear()
        search_box.send_keys(TARGET_CHAT_NAME)
        time.sleep(2) # Give a moment for search results to appear

        # 2. Click on the target chat
        # This XPath looks for a span with the chat name inside a list item
        chat_xpath = f'//span[@title="{TARGET_CHAT_NAME}"]'
        target_chat = wait.until(EC.element_to_be_clickable((By.XPATH, chat_xpath)))
        target_chat.click()
        logging.info(f"Opened chat: {TARGET_CHAT_NAME}")

        # 3. Click the "Attach" (paperclip) icon
        logging.info("Clicking attach icon...")
        attach_button = wait.until(EC.element_to_be_clickable((By.XPATH, '//div[@title="Attach"]')))
        attach_button.click()
        logging.info("Attach icon clicked.")

        # 4. Click the "Poll" icon
        logging.info("Clicking poll icon...")
        # This XPath specifically targets the poll icon within the attach menu
        poll_icon = wait.until(EC.element_to_be_clickable((By.XPATH, '//div[@aria-label="Poll"]')))
        poll_icon.click()
        logging.info("Poll icon clicked.")

        # 5. Wait for the poll creation dialog to appear
        logging.info("Waiting for poll creation dialog...")
        wait.until(EC.presence_of_element_located((By.XPATH, '//div[@role="dialog"]//span[contains(text(), "Create poll")]')))
        logging.info("Poll creation dialog appeared.")

        # 6. Fill in the poll question
        logging.info(f"Entering poll question: {POLL_QUESTION}")
        question_field = wait.until(EC.element_to_be_clickable((By.XPATH, '//div[@role="dialog"]//div[@contenteditable="true"][@data-tab="1"]')))
        question_field.send_keys(POLL_QUESTION)

        # 7. Fill in the poll options
        logging.info("Entering poll options...")
        for i, option_text in enumerate(POLL_OPTIONS):
            # The data-tab attribute increments for each option field
            option_field_xpath = f'//div[@role="dialog"]//div[@contenteditable="true"][@data-tab="{i + 2}"]'
            option_field = wait.until(EC.element_to_be_clickable((By.XPATH, option_field_xpath)))
            option_field.send_keys(option_text)
            logging.info(f"  - Added option: {option_text}")
            time.sleep(0.5) # Small delay between options

        # 8. Ensure 'Allow multiple answers' is turned OFF (if it's on by default)
        logging.info("Checking 'Allow multiple answers' toggle state...")
        # This XPath targets the input element of the toggle switch
        toggle_input = wait.until(EC.presence_of_element_located((By.XPATH, '//input[@id="polls-single-option-switch"]')))
        if toggle_input.is_selected(): # If it's selected (meaning multiple answers are allowed)
            logging.info(" 'Allow multiple answers' is ON. Clicking to turn it OFF.")
            # Click the parent div or span that acts as the clickable area for the toggle
            toggle_clickable_area = wait.until(EC.element_to_be_clickable((By.XPATH, '//div[@role="dialog"]//div[contains(text(), "Allow multiple answers")]/ancestor::div[contains(@class, "x1c4vz4f")]')))
            toggle_clickable_area.click()
            logging.info(" 'Allow multiple answers' turned OFF.")
        else:
            logging.info(" 'Allow multiple answers' is already OFF.")

        # 9. Click the "Create Poll" button
        logging.info("Clicking 'Create Poll' button...")
        create_poll_button = wait.until(EC.element_to_be_clickable((By.XPATH, '//div[@role="dialog"]//button//span[contains(text(), "Create poll")]')))
        create_poll_button.click()
        logging.info("Poll created and sent!")
        logging.info("*************************")

    except TimeoutException as e:
        logging.error(f"A TIMEOUT OCCURRED. The script could not find an element in time. WhatsApp may have updated or the connection is slow. Error: {e}")
        # On timeout, save a screenshot for easy debugging
        if driver:
            screenshot_path = f"error_screenshot_{time.strftime('%Y%m%d-%H%M%S')}.png"
            driver.save_screenshot(screenshot_path)
            logging.error(f"Screenshot of the error saved to: {screenshot_path}")
    except NoSuchElementException as e:
        logging.error(f"A 'NO SUCH ELEMENT' ERROR OCCURRED. A selector is broken due to a WhatsApp update. Error: {e}")
        if driver:
            screenshot_path = f"error_screenshot_{time.strftime('%Y%m%d-%H%M%S')}.png"
            driver.save_screenshot(screenshot_path)
            logging.error(f"Screenshot of the error saved to: {screenshot_path}")
    except Exception as e:
        logging.error(f"An unexpected error occurred: {e}", exc_info=True)
        if driver:
            screenshot_path = f"error_screenshot_{time.strftime('%Y%m%d-%H%M%S')}.png"
            driver.save_screenshot(screenshot_path)
            logging.error(f"Screenshot of the error saved to: {screenshot_path}")
    finally:
        if driver:
            logging.info("Closing the browser.")
            driver.quit() # Ensure the browser is always closed
        logging.info("Script finished.")

if __name__ == "__main__":
    run_whatsapp_poll_bot()
