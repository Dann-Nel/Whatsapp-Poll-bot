import time
import json
import schedule
import logging
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.service import Service
from selenium.common.exceptions import TimeoutException, NoSuchElementException

# --- Setup Logging ---
# This will create a 'poll_bot.log' file to record what happens
logging.basicConfig(
    filename='poll_bot.log',
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)

# --- Load Configuration ---
try:
    with open('config.json', 'r', encoding='utf-8') as f:
        config = json.load(f)
except FileNotFoundError:
    print("FATAL ERROR: config.json not found. Please create it.")
    logging.error("config.json not found.")
    exit()

GROUP_NAME = config['group_name']
POLL_QUESTION = config['poll_question']
POLL_OPTIONS = config['poll_options']
CHROME_DRIVER_PATH = config['chromedriver_path']
SCHEDULE_DAY = config['schedule_day']
SCHEDULE_TIME = config['schedule_time']


def send_whatsapp_poll():
    """
    This function opens WhatsApp Web, finds the specified group,
    and sends a pre-defined poll.
    """
    logging.info("Starting the WhatsApp Poll Bot...")
    driver = None
    
    try: 
        # Set up Selenium service and options
        service = Service(executable_path=CHROME_DRIVER_PATH)
        options = webdriver.ChromeOptions()
        # The "detach" option MUST be disabled for scheduled tasks. It leaves "zombie"
        # browser processes running, which causes errors on subsequent runs.
        # options.add_experimental_option("detach", True) 
        options.add_argument("user-data-dir=C:/whatsapp_profile")

        driver = webdriver.Chrome(service=service, options=options)
        
        # Set a 30-second default wait time
        wait = WebDriverWait(driver, 30) 

        # Open WhatsApp Web
        driver.get("https://web.whatsapp.com/")
        
        # 1. Wait for user to scan QR code and for the search bar to be available
        login_wait = WebDriverWait(driver, 120) 
        logging.info("Waiting for WhatsApp to load. Please scan the QR code if needed.")
        search_box_xpath = '//div[@contenteditable="true"][@data-tab="3"]'
        search_box = login_wait.until(
            EC.presence_of_element_located((By.XPATH, search_box_xpath))
        )
        logging.info("WhatsApp loaded successfully.")
        
        # 2. Search for the group
        logging.info(f"Searching for group: {GROUP_NAME}")
        search_box.send_keys(GROUP_NAME)
        
        logging.info("Waiting 2 seconds for search results to appear...")
        time.sleep(2) 

        # 3. Click on the group (Wait for the search result to appear)
        logging.info(f"Waiting to click group: {GROUP_NAME}")
        group_xpath = f'//span[@title="{GROUP_NAME}"]'
        group_element = wait.until(
            EC.element_to_be_clickable((By.XPATH, group_xpath))
        )
        group_element.click()
        logging.info(f"Opened chat for {GROUP_NAME}.")

        # 4. Wait for the "Type a message" box to be ready.
        logging.info("Waiting for chat to be fully interactive (finding 'Type a message' box)...")
        message_box_xpath = '//div[@data-tab="10"][@contenteditable="true"]'
        wait.until(EC.element_to_be_clickable((By.XPATH, message_box_xpath)))
        logging.info("Chat is ready.")

        # 5. Click the attach button (plus icon)
        logging.info("Waiting for 'Attach' (plus) button...")
        attach_button_xpath = '//div[@aria-label="Attach"]' # This selector is working
        attach_button = wait.until(
            EC.element_to_be_clickable((By.XPATH, attach_button_xpath))
        )
        attach_button.click()

        # 6. Click the "Poll" button
        logging.info("Waiting for 'Poll' button...")
        poll_button_xpath = '//*[text()="Poll"]' # This selector is working
        poll_button = wait.until(
            EC.element_to_be_clickable((By.XPATH, poll_button_xpath))
        )
        poll_button.click()
        logging.info("Opened the poll creation menu.")
        
        # 7. Fill in the poll question
        logging.info("Waiting for 'Question' input box...")
        # This selector is working
        all_fields_xpath = '//div[@role="dialog"]//div[@contenteditable="true"]'
        question_box = wait.until(
            EC.presence_of_element_located((By.XPATH, all_fields_xpath))
        )
        question_box.send_keys(POLL_QUESTION)
        logging.info(f"Entered poll question: {POLL_QUESTION}")

        # 8. Fill in the poll options one by one
        logging.info("Filling in poll options...")
        # This logic is working
        for i, option_text in enumerate(POLL_OPTIONS):
            wait.until(lambda d: len(d.find_elements(By.XPATH, all_fields_xpath)) >= (i + 2))
            all_fields = driver.find_elements(By.XPATH, all_fields_xpath)
            all_fields[i+1].send_keys(option_text)
            logging.info(f"Entered option {i+1}: {option_text}")
        
        # 9. Untick the 'Allow multiple answers' toggle
        logging.info("Waiting for 'Allow multiple answers' toggle to be clickable...")
        # This selector finds the label for the toggle switch, which is a reliable element to click.
        toggle_xpath = '//label[text()="Allow multiple answers"]'
        toggle_button = wait.until(
            EC.element_to_be_clickable((By.XPATH, toggle_xpath))
        )
        toggle_button.click()
        logging.info("Unticked 'Allow multiple answers'.")
        
        # 10. Click the send button to send the poll
        logging.info("Waiting for 'Send' button to be clickable...")
        # This selector finds the DIV acting as a button with the specific aria-label "Send".
        send_button_xpath = '//div[@aria-label="Send"]'
        send_button = wait.until(
            EC.element_to_be_clickable((By.XPATH, send_button_xpath))
        )
        send_button.click()
        logging.info("*************************")
        logging.info("POLL SUCCESSFULLY SENT!")
        logging.info("*************************")

        # Wait for 2 seconds to ensure the poll is sent before closing
        logging.info("Waiting 2 seconds before closing...")
        time.sleep(2)

    except TimeoutException:
        logging.error("A TIMEOUT OCCURRED. The script could not find a button. WhatsApp may have updated.")
    except NoSuchElementException:
        logging.error("A 'NO SUCH ELEMENT' ERROR OCCURRED. A selector is broken due to a WhatsApp update.")
    except Exception as e:
        logging.error(f"An unexpected error occurred: {e}")
    finally:
        # For a scheduled task, it's crucial to close the browser to free up resources.
        if driver:
            logging.info("Closing the browser.")
            driver.quit()
        logging.info("Poll sending task finished.")

# --- SCRIPT EXECUTION ---
if __name__ == "__main__":
    print("--- WhatsApp Poll Bot ---")
    logging.info("--- Scheduler starting ---")
    
    # Dynamically get the schedule day from the config file
    try:
        schedule_job = getattr(schedule.every(), SCHEDULE_DAY)
        schedule_job.at(SCHEDULE_TIME).do(send_whatsapp_poll)
        print(f"Poll scheduled to be sent every {SCHEDULE_DAY.capitalize()} at {SCHEDULE_TIME}.")
        logging.info(f"Poll scheduled for every {SCHEDULE_DAY} at {SCHEDULE_TIME}.")
    except AttributeError:
        print(f"ERROR: Invalid 'schedule_day' in config.json: '{SCHEDULE_DAY}'")
        logging.error(f"Invalid 'schedule_day' in config: '{SCHEDULE_DAY}'")
        exit()

    try:
        while True:
            schedule.run_pending()
            time.sleep(1)
    except KeyboardInterrupt:
        print("\nScheduler stopped by user.")
        logging.info("Scheduler stopped by user (KeyboardInterrupt).")
    
    print("Exiting bot.")
    logging.info("--- Script finished ---")