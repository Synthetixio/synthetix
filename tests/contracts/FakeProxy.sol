contract FakeProxy {
    address public messageSender;

    function _setMessageSender(address sender) 
        public
    {
        messageSender = sender;
    }

    function messageSender()
        public
        view
        returns (address)
    {
        return messageSender;
    }
}
